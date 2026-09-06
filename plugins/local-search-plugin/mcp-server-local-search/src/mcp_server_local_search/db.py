import sqlite3
import threading
from pathlib import Path

import sqlite_vec

from .config import (
    CHUNK_CHARS,
    CHUNK_OVERLAP_CHARS,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
)

SCHEMA_VERSION = 1

write_lock = threading.Lock()
"""Held around every write. See connect() for why the connection is shared across threads."""

_TABLES = """
create table if not exists meta (
  key   text primary key,
  value text not null
);

create table if not exists search_roots (
  root_id         integer primary key,
  path            text not null unique,
  recursive       integer not null default 1,
  added_at        text not null,
  last_indexed_at text
);

create table if not exists files (
  file_id      integer primary key,
  root_id      integer not null references search_roots(root_id) on delete cascade,
  path         text not null unique,
  ext          text not null,
  size         integer not null,
  mtime_ns     integer not null,
  content_hash text,
  text_path    text,
  status       text not null,
  error        text,
  indexed_at   text
);
create index if not exists idx_files_root on files(root_id);
create index if not exists idx_files_status on files(status);

create table if not exists chunks (
  chunk_id   integer primary key,
  file_id    integer not null references files(file_id) on delete cascade,
  ordinal    integer not null,
  start_line integer not null,
  end_line   integer not null,
  text       text not null
);
create index if not exists idx_chunks_file on chunks(file_id);
create unique index if not exists idx_chunks_file_ordinal on chunks(file_id, ordinal);

create table if not exists index_runs (
  run_id         integer primary key,
  mode           text not null,
  state          text not null,
  started_at     text not null,
  finished_at    text,
  current_file   text,
  files_scanned  integer not null default 0,
  files_total    integer,
  files_indexed  integer not null default 0,
  files_skipped  integer not null default 0,
  files_failed   integer not null default 0,
  chunks_written integer not null default 0,
  error          text
);
"""

_FTS = """
create virtual table if not exists chunks_fts using fts5(
  text,
  content='chunks',
  content_rowid='chunk_id',
  tokenize='trigram'
);
"""

# External-content FTS5 is not kept in sync automatically. The delete form must use the
# special 'delete' command row, otherwise the index keeps stale postings.
_TRIGGERS = """
create trigger if not exists chunks_ai after insert on chunks begin
  insert into chunks_fts(rowid, text) values (new.chunk_id, new.text);
end;

create trigger if not exists chunks_ad after delete on chunks begin
  insert into chunks_fts(chunks_fts, rowid, text) values ('delete', old.chunk_id, old.text);
end;

create trigger if not exists chunks_au after update on chunks begin
  insert into chunks_fts(chunks_fts, rowid, text) values ('delete', old.chunk_id, old.text);
  insert into chunks_fts(rowid, text) values (new.chunk_id, new.text);
end;
"""

_VEC = f"""
create virtual table if not exists chunks_vec using vec0(
  chunk_id  integer primary key,
  embedding float[{EMBEDDING_DIM}]
);
"""


def connect(path: Path | str) -> sqlite3.Connection:
    """Open a connection with sqlite-vec loaded.

    check_same_thread is off because the MCP SDK dispatches sync tool handlers on a worker
    thread pool, so a connection made during lifespan is used from other threads.
    Serialize writes through write_lock; SQLite itself is built thread-safe.
    """
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("pragma journal_mode = WAL")
    conn.execute("pragma synchronous = NORMAL")
    conn.execute("pragma foreign_keys = ON")
    return conn


def initialize(conn: sqlite3.Connection) -> None:
    conn.executescript(_TABLES)
    conn.executescript(_FTS)
    conn.executescript(_TRIGGERS)
    conn.executescript(_VEC)
    _write_defaults(conn)
    conn.commit()


def _write_defaults(conn: sqlite3.Connection) -> None:
    defaults = {
        "schema_version": str(SCHEMA_VERSION),
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dim": str(EMBEDDING_DIM),
        "chunk_chars": str(CHUNK_CHARS),
        "chunk_overlap": str(CHUNK_OVERLAP_CHARS),
    }
    conn.executemany(
        "insert or ignore into meta(key, value) values (?, ?)",
        list(defaults.items()),
    )


def get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("select value from meta where key = ?", (key,)).fetchone()
    return row["value"] if row else None


def settings_mismatches(conn: sqlite3.Connection) -> list[str]:
    """Report stored settings that no longer match the code, requiring a full rebuild."""
    expected = {
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dim": str(EMBEDDING_DIM),
        "chunk_chars": str(CHUNK_CHARS),
        "chunk_overlap": str(CHUNK_OVERLAP_CHARS),
    }
    mismatches = []
    for key, want in expected.items():
        got = get_meta(conn, key)
        if got is not None and got != want:
            mismatches.append(f"{key}: index built with {got!r}, code expects {want!r}")
    return mismatches


def delete_file_chunks(conn: sqlite3.Connection, file_id: int) -> int:
    """Drop a file's chunks and their vectors.

    chunks_vec is a virtual table so the foreign key on chunks does not reach it;
    its rows must go first, while the chunk ids are still resolvable.
    """
    ids = [
        row["chunk_id"]
        for row in conn.execute("select chunk_id from chunks where file_id = ?", (file_id,))
    ]
    if not ids:
        return 0
    conn.executemany("delete from chunks_vec where chunk_id = ?", [(i,) for i in ids])
    conn.execute("delete from chunks where file_id = ?", (file_id,))
    return len(ids)


def delete_file(conn: sqlite3.Connection, file_id: int) -> int:
    deleted = delete_file_chunks(conn, file_id)
    conn.execute("delete from files where file_id = ?", (file_id,))
    return deleted


def reconcile_interrupted_runs(conn: sqlite3.Connection) -> int:
    """Mark runs left behind by a previous process as interrupted.

    A run can only be active while the process that started it is alive, so any row still
    marked running at startup belongs to a server that went away mid-index.
    """
    cur = conn.execute(
        "update index_runs set state = 'interrupted', finished_at = datetime('now') "
        "where state in ('running', 'preparing_model')"
    )
    conn.commit()
    return cur.rowcount


def counts(conn: sqlite3.Connection) -> tuple[int, int]:
    files = conn.execute("select count(*) as n from files").fetchone()["n"]
    chunks = conn.execute("select count(*) as n from chunks").fetchone()["n"]
    return files, chunks


def db_size_bytes(path: Path) -> int:
    total = 0
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(str(path) + suffix)
        if candidate.exists():
            total += candidate.stat().st_size
    return total

