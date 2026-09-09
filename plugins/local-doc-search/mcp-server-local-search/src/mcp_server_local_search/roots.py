import os
import sqlite3
from pathlib import Path

from . import db
from .config import SUPPORTED_EXTENSIONS, is_excluded_dir


class RootError(ValueError):
    """The given path cannot be used as a search root."""


def normalize(raw: str) -> Path:
    """Turn user input into the canonical absolute path used as the table key.

    Symlinks are resolved so two spellings of the same directory cannot both register.
    """
    if not raw or not raw.strip():
        raise RootError("パスが空です")
    return Path(raw.strip()).expanduser().resolve()


def validate(path: Path) -> None:
    if not path.exists():
        raise RootError(f"パスが存在しません: {path}")
    if not path.is_dir():
        raise RootError(f"ディレクトリではありません: {path}")
    if not os.access(path, os.R_OK | os.X_OK):
        raise RootError(f"読み取り権限がありません: {path}")


def find_conflict(path: Path, existing: list[Path]) -> str | None:
    """Reject overlapping roots, which would index the same file twice."""
    for other in existing:
        if path == other:
            return f"すでに登録済みです: {other}"
        if path.is_relative_to(other):
            return f"登録済みの {other} に含まれています"
        if other.is_relative_to(path):
            return f"登録済みの {other} を含んでいます"
    return None


def iter_documents(root: Path, recursive: bool = True):
    """Walk a root yielding supported document paths, skipping noise and symlink loops."""
    seen_dirs: set[Path] = set()
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        current = Path(dirpath)
        resolved = current.resolve()
        if resolved in seen_dirs:
            dirnames[:] = []
            continue
        seen_dirs.add(resolved)

        dirnames[:] = [] if not recursive else [d for d in dirnames if not is_excluded_dir(d)]

        for name in filenames:
            if Path(name).suffix.lower() in SUPPORTED_EXTENSIONS:
                yield current / name


def count_documents(root: Path, recursive: bool = True, limit: int | None = None) -> int:
    """Count supported documents, stopping early once limit is reached."""
    total = 0
    for _ in iter_documents(root, recursive):
        total += 1
        if limit is not None and total >= limit:
            break
    return total


def list_roots(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(conn.execute("select * from search_roots order by root_id"))


def existing_paths(conn: sqlite3.Connection) -> list[Path]:
    return [Path(row["path"]) for row in conn.execute("select path from search_roots")]


def insert_root(conn: sqlite3.Connection, path: Path, recursive: bool) -> int:
    with db.write_lock:
        cur = conn.execute(
            "insert into search_roots(path, recursive, added_at) values (?, ?, datetime('now'))",
            (str(path), 1 if recursive else 0),
        )
        conn.commit()
        return int(cur.lastrowid or 0)


def find_root(conn: sqlite3.Connection, path: Path) -> sqlite3.Row | None:
    return conn.execute("select * from search_roots where path = ?", (str(path),)).fetchone()


def root_file_stats(conn: sqlite3.Connection, root_id: int) -> tuple[int, int, int]:
    row = conn.execute(
        "select "
        "  sum(status = 'indexed') as indexed, "
        "  sum(status = 'failed') as failed, "
        "  sum(status = 'skipped') as skipped "
        "from files where root_id = ?",
        (root_id,),
    ).fetchone()
    return (row["indexed"] or 0, row["failed"] or 0, row["skipped"] or 0)
