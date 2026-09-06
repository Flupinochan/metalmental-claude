import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path

from . import db, indexer, roots
from .embed import EmbedderError, LazyEmbedder
from .indexer import Embedder, Progress


@dataclass
class JobHandle:
    run_id: int
    thread: threading.Thread
    cancel: threading.Event
    progress: Progress


class IndexJobManager:
    """Runs one index job at a time on a worker thread.

    Embedding is CPU-bound and never awaits, so running it on the event loop would freeze
    the whole server and make get_index_status unanswerable while indexing.
    """

    def __init__(self, conn: sqlite3.Connection, data_dir: Path, embedder: Embedder):
        self._conn = conn
        self._data_dir = data_dir
        self._embedder = embedder
        self._lock = threading.Lock()
        self._current: JobHandle | None = None

    @property
    def current(self) -> JobHandle | None:
        with self._lock:
            handle = self._current
        if handle is not None and not handle.thread.is_alive():
            return None
        return handle

    def is_running(self) -> bool:
        return self.current is not None

    def start(self, targets: list[sqlite3.Row], mode: str) -> tuple[int | None, bool]:
        with self._lock:
            if self._current is not None and self._current.thread.is_alive():
                return self._current.run_id, True

            run_id = self._open_run(mode)
            cancel = threading.Event()
            progress = Progress(files_total=None)
            thread = threading.Thread(
                target=self._run,
                args=(run_id, targets, mode, progress, cancel),
                name=f"local-search-index-{run_id}",
                daemon=True,
            )
            self._current = JobHandle(run_id, thread, cancel, progress)
            thread.start()
            return run_id, False

    def cancel(self) -> int | None:
        handle = self.current
        if handle is None:
            return None
        handle.cancel.set()
        return handle.run_id

    def _open_run(self, mode: str) -> int:
        with db.write_lock:
            cur = self._conn.execute(
                "insert into index_runs(mode, state, started_at) "
                "values (?, 'preparing_model', datetime('now'))",
                (mode,),
            )
            self._conn.commit()
        return int(cur.lastrowid or 0)

    def _set_state(self, run_id: int, state: str, error: str | None = None) -> None:
        finished = state in ("completed", "failed", "cancelled", "interrupted")
        with db.write_lock:
            self._conn.execute(
                "update index_runs set state = ?, error = ?, "
                "finished_at = case when ? then datetime('now') else finished_at end "
                "where run_id = ?",
                (state, error, finished, run_id),
            )
            self._conn.commit()

    def _flush(self, run_id: int, progress: Progress) -> None:
        with db.write_lock:
            self._conn.execute(
                "update index_runs set files_scanned = ?, files_total = ?, files_indexed = ?, "
                "files_skipped = ?, files_failed = ?, chunks_written = ?, current_file = ? "
                "where run_id = ?",
                (
                    progress.files_scanned,
                    progress.files_total,
                    progress.files_indexed,
                    progress.files_skipped,
                    progress.files_failed,
                    progress.chunks_written,
                    progress.current_file,
                    run_id,
                ),
            )
            self._conn.commit()

    def _run(
        self,
        run_id: int,
        targets: list[sqlite3.Row],
        mode: str,
        progress: Progress,
        cancel: threading.Event,
    ) -> None:
        try:
            if isinstance(self._embedder, LazyEmbedder) and not self._embedder.is_ready:
                self._embedder.load()
            self._set_state(run_id, "running")

            progress.files_total = sum(
                roots.count_documents(Path(row["path"]), bool(row["recursive"]))
                for row in targets
            )
            self._flush(run_id, progress)

            for row in targets:
                if cancel.is_set():
                    break
                indexer.index_root(
                    self._conn,
                    self._data_dir,
                    row,
                    self._embedder,
                    progress,
                    force=(mode == "full"),
                    cancel=cancel,
                )
                self._flush(run_id, progress)

            indexer.prune_orphan_sidecars(self._conn, self._data_dir)
            progress.current_file = None
            self._flush(run_id, progress)
            self._set_state(run_id, "cancelled" if cancel.is_set() else "completed")
        except EmbedderError as exc:
            self._flush(run_id, progress)
            self._set_state(run_id, "failed", str(exc))
        except Exception as exc:  # noqa: BLE001
            # An exception escaping this thread would leave the run stuck on 'running',
            # so every failure is recorded on the row the client polls instead.
            self._flush(run_id, progress)
            self._set_state(run_id, "failed", f"{type(exc).__name__}: {exc}")


def latest_run(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute("select * from index_runs order by run_id desc limit 1").fetchone()
