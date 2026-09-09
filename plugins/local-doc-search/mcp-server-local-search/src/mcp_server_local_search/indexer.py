import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from sqlite_vec import serialize_float32

from . import db, extract, roots
from .chunk import chunk_lines
from .config import MAX_FILE_SIZE, extracted_dir
from .extract import ExtractError

MAX_RECENT_ERRORS = 5


class Embedder(Protocol):
    def encode(self, texts: list[str]) -> list[list[float]]: ...


@dataclass
class Progress:
    files_scanned: int = 0
    files_total: int | None = None
    files_indexed: int = 0
    files_skipped: int = 0
    files_failed: int = 0
    chunks_written: int = 0
    current_file: str | None = None
    recent_errors: list[str] = field(default_factory=list)

    def record_error(self, path: Path, reason: str) -> None:
        self.files_failed += 1
        self.recent_errors.append(f"{path}: {reason}")
        del self.recent_errors[:-MAX_RECENT_ERRORS]


@dataclass(frozen=True)
class FileAction:
    kind: str
    """One of: index, rehash, skip."""
    reason: str


def decide_action(row: sqlite3.Row | None, size: int, mtime_ns: int) -> FileAction:
    """Choose the cheapest way to bring one file up to date.

    stat alone cannot tell a real edit from a touch, so an unchanged stat skips outright
    while any difference falls through to hashing rather than straight to re-embedding.
    """
    if row is None:
        return FileAction("index", "新規")
    if row["status"] == "failed":
        return FileAction("index", "前回失敗")
    if row["size"] == size and row["mtime_ns"] == mtime_ns:
        return FileAction("skip", "変更なし")
    return FileAction("rehash", "サイズまたは更新時刻が変化")


def _upsert_file(
    conn: sqlite3.Connection,
    root_id: int,
    path: Path,
    size: int,
    mtime_ns: int,
    digest: str | None,
    text_path: Path | None,
    status: str,
    error: str | None,
) -> int:
    with db.write_lock:
        conn.execute(
            "insert into files(root_id, path, ext, size, mtime_ns, content_hash, text_path, "
            "                  status, error, indexed_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) "
            "on conflict(path) do update set "
            "  root_id=excluded.root_id, size=excluded.size, mtime_ns=excluded.mtime_ns, "
            "  content_hash=excluded.content_hash, text_path=excluded.text_path, "
            "  status=excluded.status, error=excluded.error, indexed_at=excluded.indexed_at",
            (
                root_id,
                str(path),
                path.suffix.lower(),
                size,
                mtime_ns,
                digest,
                str(text_path) if text_path else None,
                status,
                error,
            ),
        )
        conn.commit()
    row = conn.execute("select file_id from files where path = ?", (str(path),)).fetchone()
    return row["file_id"]


def _write_chunks(
    conn: sqlite3.Connection, file_id: int, lines: list[str], embedder: Embedder
) -> int:
    chunks = chunk_lines(lines)
    if not chunks:
        with db.write_lock:
            db.delete_file_chunks(conn, file_id)
            conn.commit()
        return 0

    vectors = embedder.encode([c.text for c in chunks])
    with db.write_lock:
        db.delete_file_chunks(conn, file_id)
        for chunk, vector in zip(chunks, vectors, strict=True):
            cur = conn.execute(
                "insert into chunks(file_id, ordinal, start_line, end_line, text) "
                "values (?, ?, ?, ?, ?)",
                (file_id, chunk.ordinal, chunk.start_line, chunk.end_line, chunk.text),
            )
            conn.execute(
                "insert into chunks_vec(chunk_id, embedding) values (?, ?)",
                (cur.lastrowid, serialize_float32(vector)),
            )
        conn.commit()
    return len(chunks)


def index_file(
    conn: sqlite3.Connection,
    data_dir: Path,
    root_id: int,
    path: Path,
    embedder: Embedder,
    progress: Progress,
    force: bool = False,
) -> None:
    try:
        stat = path.stat()
    except OSError as exc:
        progress.record_error(path, str(exc))
        return

    row = conn.execute("select * from files where path = ?", (str(path),)).fetchone()

    if stat.st_size > MAX_FILE_SIZE:
        _upsert_file(
            conn, root_id, path, stat.st_size, stat.st_mtime_ns, None, None, "skipped",
            f"{MAX_FILE_SIZE} バイトを超えるためスキップ",
        )
        progress.files_skipped += 1
        return

    action = FileAction("index", "全件再構築") if force else decide_action(row, stat.st_size, stat.st_mtime_ns)
    if action.kind == "skip":
        progress.files_skipped += 1
        return

    try:
        digest = extract.content_hash(path)
    except OSError as exc:
        progress.record_error(path, str(exc))
        return

    if action.kind == "rehash" and row is not None and row["content_hash"] == digest:
        _upsert_file(
            conn, root_id, path, stat.st_size, stat.st_mtime_ns, digest,
            Path(row["text_path"]) if row["text_path"] else None, "indexed", None,
        )
        progress.files_skipped += 1
        return

    try:
        extracted = extract.extract(path, extracted_dir(data_dir), digest)
    except ExtractError as exc:
        _upsert_file(
            conn, root_id, path, stat.st_size, stat.st_mtime_ns, digest, None, "failed", str(exc)
        )
        progress.record_error(path, str(exc))
        return

    file_id = _upsert_file(
        conn, root_id, path, stat.st_size, stat.st_mtime_ns, digest,
        extracted.text_path, "indexed", None,
    )
    progress.chunks_written += _write_chunks(conn, file_id, extracted.lines, embedder)
    progress.files_indexed += 1


def prune_missing(conn: sqlite3.Connection, root_id: int, seen: set[str]) -> int:
    """Drop rows for files the scan never reached, which means they are gone."""
    rows = conn.execute("select file_id, path from files where root_id = ?", (root_id,)).fetchall()
    removed = 0
    with db.write_lock:
        for row in rows:
            if row["path"] not in seen:
                db.delete_file(conn, row["file_id"])
                removed += 1
        conn.commit()
    return removed


def index_root(
    conn: sqlite3.Connection,
    data_dir: Path,
    root: sqlite3.Row,
    embedder: Embedder,
    progress: Progress,
    force: bool = False,
    cancel: threading.Event | None = None,
) -> None:
    root_id, root_path = root["root_id"], Path(root["path"])
    seen: set[str] = set()

    for path in roots.iter_documents(root_path, bool(root["recursive"])):
        if cancel is not None and cancel.is_set():
            return
        progress.current_file = str(path)
        progress.files_scanned += 1
        seen.add(str(path))
        index_file(conn, data_dir, root_id, path, embedder, progress, force)

    prune_missing(conn, root_id, seen)
    with db.write_lock:
        conn.execute(
            "update search_roots set last_indexed_at = datetime('now') where root_id = ?",
            (root_id,),
        )
        conn.commit()


def prune_orphan_sidecars(conn: sqlite3.Connection, data_dir: Path) -> int:
    keep = {
        Path(row["text_path"])
        for row in conn.execute("select text_path from files where text_path is not null")
    }
    return extract.prune_sidecars(extracted_dir(data_dir), keep)
