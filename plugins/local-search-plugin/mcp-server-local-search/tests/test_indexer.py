"""Tests for scanning, incremental detection, and index writes. Embedding is stubbed."""

import hashlib
import os
import sqlite3
import threading

import pytest

from mcp_server_local_search import db, indexer, roots
from mcp_server_local_search.config import EMBEDDING_DIM
from mcp_server_local_search.indexer import Progress, decide_action

from .conftest import write_docx


class FakeEmbedder:
    """Deterministic vectors derived from the text, so tests need no real model."""

    def __init__(self):
        self.calls = 0

    def encode(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        vectors = []
        for text in texts:
            seed = hashlib.sha256(text.encode()).digest()
            vectors.append([seed[i % len(seed)] / 255.0 for i in range(EMBEDDING_DIM)])
        return vectors


@pytest.fixture
def workspace(tmp_path):
    data_dir, docs = tmp_path / "data", tmp_path / "docs"
    data_dir.mkdir()
    docs.mkdir()
    conn = db.connect(data_dir / "index.db")
    db.initialize(conn)
    root_id = roots.insert_root(conn, docs, recursive=True)
    root = roots.find_root(conn, docs)
    yield conn, data_dir, docs, root, root_id
    conn.close()


def run_index(workspace, embedder, force=False, cancel=None):
    conn, data_dir, _, root, _ = workspace
    progress = Progress()
    indexer.index_root(conn, data_dir, root, embedder, progress, force=force, cancel=cancel)
    return progress


def make_row(status: str = "indexed", size: int = 100, mtime_ns: int = 1) -> sqlite3.Row:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    return conn.execute(
        "select ? as status, ? as size, ? as mtime_ns", (status, size, mtime_ns)
    ).fetchone()


class TestDecideAction:
    """The three-stage rule: stat to skip, hash to confirm, otherwise re-embed."""

    def test_new_file_is_indexed(self):
        assert decide_action(None, 100, 1).kind == "index"

    def test_unchanged_stat_skips_without_reading(self):
        assert decide_action(make_row(), 100, 1).kind == "skip"

    def test_changed_size_falls_through_to_hashing(self):
        assert decide_action(make_row(), 200, 1).kind == "rehash"

    def test_changed_mtime_falls_through_to_hashing(self):
        assert decide_action(make_row(), 100, 2).kind == "rehash"

    def test_previous_failure_is_retried(self):
        assert decide_action(make_row(status="failed"), 100, 1).kind == "index"


class TestIncrementalIndexing:
    def test_indexes_new_files(self, workspace):
        _, _, docs, _, _ = workspace
        (docs / "a.md").write_text("確定申告の書類をまとめる")
        (docs / "b.md").write_text("住民税の通知が届いた")
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_indexed == 2
        assert progress.chunks_written == 2

    def test_second_run_skips_everything(self, workspace):
        _, _, docs, _, _ = workspace
        (docs / "a.md").write_text("確定申告の書類をまとめる")
        run_index(workspace, FakeEmbedder())
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_indexed == 0
        assert progress.files_skipped == 1

    def test_edited_content_is_reindexed(self, workspace):
        conn, _, docs, _, _ = workspace
        target = docs / "a.md"
        target.write_text("最初の内容")
        run_index(workspace, FakeEmbedder())
        target.write_text("まったく違う内容に書き換えた")
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_indexed == 1
        stored = conn.execute("select text from chunks").fetchone()["text"]
        assert stored == "まったく違う内容に書き換えた"

    def test_touch_alone_does_not_re_embed(self, workspace):
        _, _, docs, _, _ = workspace
        target = docs / "a.md"
        target.write_text("内容は変わっていない")
        run_index(workspace, FakeEmbedder())

        os.utime(target, ns=(1_000_000_000, 2_000_000_000))
        embedder = FakeEmbedder()
        progress = run_index(workspace, embedder)
        assert progress.files_indexed == 0
        assert progress.files_skipped == 1
        assert embedder.calls == 0

    def test_deleted_file_is_removed_from_the_index(self, workspace):
        conn, _, docs, _, _ = workspace
        target = docs / "a.md"
        target.write_text("いずれ消される内容")
        run_index(workspace, FakeEmbedder())
        target.unlink()
        run_index(workspace, FakeEmbedder())
        assert db.counts(conn) == (0, 0)

    def test_force_reindexes_unchanged_files(self, workspace):
        _, _, docs, _, _ = workspace
        (docs / "a.md").write_text("変えていない内容")
        run_index(workspace, FakeEmbedder())
        progress = run_index(workspace, FakeEmbedder(), force=True)
        assert progress.files_indexed == 1


class TestVectorConsistency:
    """Every chunk needs exactly one vector, or hybrid search silently loses hits."""

    def test_chunks_and_vectors_stay_in_step(self, workspace):
        conn, _, docs, _, _ = workspace
        (docs / "long.md").write_text("\n\n".join(f"段落{i}の本文です" * 20 for i in range(10)))
        run_index(workspace, FakeEmbedder())
        chunks = conn.execute("select count(*) as n from chunks").fetchone()["n"]
        vectors = conn.execute("select count(*) as n from chunks_vec").fetchone()["n"]
        assert chunks == vectors > 1

    def test_reindexing_does_not_leave_stale_vectors(self, workspace):
        conn, _, docs, _, _ = workspace
        target = docs / "a.md"
        target.write_text("\n\n".join(f"元の段落{i}です" * 20 for i in range(8)))
        run_index(workspace, FakeEmbedder())
        target.write_text("短くした")
        run_index(workspace, FakeEmbedder())
        chunks = conn.execute("select count(*) as n from chunks").fetchone()["n"]
        vectors = conn.execute("select count(*) as n from chunks_vec").fetchone()["n"]
        assert chunks == vectors == 1

    def test_removing_a_root_clears_its_vectors(self, workspace):
        conn, _, docs, _, root_id = workspace
        (docs / "a.md").write_text("消える内容")
        run_index(workspace, FakeEmbedder())
        for row in conn.execute("select file_id from files where root_id = ?", (root_id,)):
            db.delete_file(conn, row["file_id"])
        conn.commit()
        assert conn.execute("select count(*) as n from chunks_vec").fetchone()["n"] == 0


class TestFailureHandling:
    def test_oversized_files_are_skipped_and_recorded(self, workspace, monkeypatch):
        _, _, docs, _, _ = workspace
        monkeypatch.setattr(indexer, "MAX_FILE_SIZE", 10)
        (docs / "big.md").write_text("この内容は上限を超えています")
        conn = workspace[0]
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_skipped == 1
        assert conn.execute("select status from files").fetchone()["status"] == "skipped"

    def test_an_unreadable_document_is_marked_failed(self, workspace):
        conn, _, docs, _, _ = workspace
        (docs / "broken.docx").write_bytes(b"PK\x03\x04" + b"\x00" * 64)
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_failed == 1
        assert conn.execute("select status from files").fetchone()["status"] == "failed"

    def test_a_failed_file_is_retried_next_run(self, workspace):
        _, _, docs, _, _ = workspace
        target = docs / "doc.docx"
        target.write_bytes(b"PK\x03\x04" + b"\x00" * 64)
        run_index(workspace, FakeEmbedder())
        write_docx(target, "復旧しました", ["本文です"])
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_indexed == 1

    def test_recent_errors_are_capped(self, workspace):
        _, _, docs, _, _ = workspace
        for i in range(8):
            (docs / f"broken{i}.docx").write_bytes(b"PK\x03\x04" + b"\x00" * 64)
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_failed == 8
        assert len(progress.recent_errors) == indexer.MAX_RECENT_ERRORS

    def test_an_empty_file_produces_no_chunks(self, workspace):
        conn, _, docs, _, _ = workspace
        (docs / "empty.md").write_text("")
        progress = run_index(workspace, FakeEmbedder())
        assert progress.files_indexed == 1
        assert conn.execute("select count(*) as n from chunks").fetchone()["n"] == 0


class TestCancellation:
    def test_a_set_event_stops_the_scan(self, workspace):
        _, _, docs, _, _ = workspace
        for i in range(5):
            (docs / f"{i}.md").write_text(f"内容{i}")
        cancel = threading.Event()
        cancel.set()
        progress = run_index(workspace, FakeEmbedder(), cancel=cancel)
        assert progress.files_indexed == 0


class TestSidecarPruning:
    def test_orphan_sidecars_are_removed(self, workspace):
        conn, data_dir, docs, _, _ = workspace
        write_docx(docs / "a.docx", "見出し", ["本文です"])
        run_index(workspace, FakeEmbedder())
        assert indexer.prune_orphan_sidecars(conn, data_dir) == 0

        (docs / "a.docx").unlink()
        run_index(workspace, FakeEmbedder())
        assert indexer.prune_orphan_sidecars(conn, data_dir) == 1
