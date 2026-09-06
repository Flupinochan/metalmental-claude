"""Tests for the schema, its FTS5 triggers, and vector cleanup."""

import sqlite3

import pytest
from sqlite_vec import serialize_float32

from mcp_server_local_search import db
from mcp_server_local_search.config import EMBEDDING_DIM


@pytest.fixture
def conn():
    connection = db.connect(":memory:")
    db.initialize(connection)
    yield connection
    connection.close()


def _add_file(conn: sqlite3.Connection, path: str = "/docs/a.md") -> int:
    conn.execute(
        "insert into search_roots(path, added_at) values (?, datetime('now'))",
        ("/docs",),
    )
    root_id = conn.execute("select root_id from search_roots where path = '/docs'").fetchone()[
        "root_id"
    ]
    cur = conn.execute(
        "insert into files(root_id, path, ext, size, mtime_ns, status) "
        "values (?, ?, '.md', 10, 1, 'indexed')",
        (root_id, path),
    )
    return int(cur.lastrowid or 0)


def _add_chunk(conn: sqlite3.Connection, file_id: int, ordinal: int, text: str) -> int:
    cur = conn.execute(
        "insert into chunks(file_id, ordinal, start_line, end_line, text) values (?, ?, ?, ?, ?)",
        (file_id, ordinal, ordinal * 10 + 1, ordinal * 10 + 5, text),
    )
    chunk_id = int(cur.lastrowid or 0)
    conn.execute(
        "insert into chunks_vec(chunk_id, embedding) values (?, ?)",
        (chunk_id, serialize_float32([0.1] * EMBEDDING_DIM)),
    )
    return chunk_id


class TestInitialize:
    """Schema creation is idempotent and records the settings it was built with."""

    def test_creates_all_objects(self, conn):
        names = {
            row["name"]
            for row in conn.execute("select name from sqlite_master where type in ('table','trigger')")
        }
        assert {"meta", "search_roots", "files", "chunks", "index_runs"} <= names
        assert {"chunks_fts", "chunks_vec"} <= names
        assert {"chunks_ai", "chunks_ad", "chunks_au"} <= names

    def test_is_idempotent(self, conn):
        db.initialize(conn)
        db.initialize(conn)
        assert db.get_meta(conn, "schema_version") == str(db.SCHEMA_VERSION)

    def test_records_build_settings(self, conn):
        assert db.get_meta(conn, "embedding_dim") == str(EMBEDDING_DIM)
        assert db.settings_mismatches(conn) == []

    def test_detects_setting_drift(self, conn):
        conn.execute("update meta set value = '512' where key = 'chunk_chars'")
        mismatches = db.settings_mismatches(conn)
        assert len(mismatches) == 1
        assert "chunk_chars" in mismatches[0]


class TestFtsTriggers:
    """The external-content FTS5 index must follow inserts, updates, and deletes."""

    def test_insert_is_searchable(self, conn):
        file_id = _add_file(conn)
        _add_chunk(conn, file_id, 0, "確定申告の書類をまとめる")
        rows = conn.execute("select rowid from chunks_fts where chunks_fts match ?", ("確定申告",)).fetchall()
        assert len(rows) == 1

    def test_delete_removes_from_index(self, conn):
        file_id = _add_file(conn)
        chunk_id = _add_chunk(conn, file_id, 0, "確定申告の書類をまとめる")
        conn.execute("delete from chunks where chunk_id = ?", (chunk_id,))
        rows = conn.execute("select rowid from chunks_fts where chunks_fts match ?", ("確定申告",)).fetchall()
        assert rows == []

    def test_update_reindexes(self, conn):
        file_id = _add_file(conn)
        chunk_id = _add_chunk(conn, file_id, 0, "確定申告の書類")
        conn.execute("update chunks set text = ? where chunk_id = ?", ("住民税の通知書", chunk_id))
        assert conn.execute(
            "select rowid from chunks_fts where chunks_fts match ?", ("確定申告",)
        ).fetchall() == []
        assert len(
            conn.execute("select rowid from chunks_fts where chunks_fts match ?", ("住民税",)).fetchall()
        ) == 1

    def test_bm25_orders_results(self, conn):
        file_id = _add_file(conn)
        _add_chunk(conn, file_id, 0, "ローカル検索についての説明")
        _add_chunk(conn, file_id, 1, "まったく無関係な内容")
        rows = conn.execute(
            "select rowid, bm25(chunks_fts) as score from chunks_fts "
            "where chunks_fts match ? order by score",
            ("ローカル検索",),
        ).fetchall()
        assert len(rows) == 1
        assert rows[0]["score"] < 0


class TestVectorCleanup:
    """chunks_vec has no foreign key, so deletions must be driven explicitly."""

    def test_delete_file_chunks_removes_vectors(self, conn):
        file_id = _add_file(conn)
        _add_chunk(conn, file_id, 0, "one")
        _add_chunk(conn, file_id, 1, "two")
        assert db.delete_file_chunks(conn, file_id) == 2
        assert conn.execute("select count(*) as n from chunks").fetchone()["n"] == 0
        assert conn.execute("select count(*) as n from chunks_vec").fetchone()["n"] == 0

    def test_delete_file_removes_row_and_vectors(self, conn):
        file_id = _add_file(conn)
        _add_chunk(conn, file_id, 0, "one")
        assert db.delete_file(conn, file_id) == 1
        assert conn.execute("select count(*) as n from files").fetchone()["n"] == 0
        assert conn.execute("select count(*) as n from chunks_vec").fetchone()["n"] == 0

    def test_delete_on_empty_file_is_noop(self, conn):
        file_id = _add_file(conn)
        assert db.delete_file_chunks(conn, file_id) == 0

    def test_cascade_alone_would_orphan_vectors(self, conn):
        """Deleting files directly leaves chunks_vec behind, which is why delete_file exists."""
        file_id = _add_file(conn)
        _add_chunk(conn, file_id, 0, "one")
        conn.execute("delete from files where file_id = ?", (file_id,))
        assert conn.execute("select count(*) as n from chunks").fetchone()["n"] == 0
        assert conn.execute("select count(*) as n from chunks_vec").fetchone()["n"] == 1

    def test_knn_returns_nearest(self, conn):
        file_id = _add_file(conn)
        near = _add_chunk(conn, file_id, 0, "near")
        conn.execute(
            "insert into chunks_vec(chunk_id, embedding) values (?, ?)",
            (999, serialize_float32([0.9] * EMBEDDING_DIM)),
        )
        rows = conn.execute(
            "select chunk_id, distance from chunks_vec where embedding match ? and k = 1",
            (serialize_float32([0.1] * EMBEDDING_DIM),),
        ).fetchall()
        assert rows[0]["chunk_id"] == near


class TestInterruptedRuns:
    """A run still marked active at startup belongs to a process that went away."""

    def test_marks_running_as_interrupted(self, conn):
        conn.executemany(
            "insert into index_runs(mode, state, started_at) values (?, ?, datetime('now'))",
            [("incremental", "running"), ("full", "preparing_model"), ("full", "completed")],
        )
        assert db.reconcile_interrupted_runs(conn) == 2
        states = [r["state"] for r in conn.execute("select state from index_runs order by run_id")]
        assert states == ["interrupted", "interrupted", "completed"]

    def test_is_safe_with_no_runs(self, conn):
        assert db.reconcile_interrupted_runs(conn) == 0


class TestCounts:
    def test_counts_files_and_chunks(self, conn):
        file_id = _add_file(conn)
        _add_chunk(conn, file_id, 0, "one")
        _add_chunk(conn, file_id, 1, "two")
        assert db.counts(conn) == (1, 2)
