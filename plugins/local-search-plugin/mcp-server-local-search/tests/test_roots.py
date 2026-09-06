"""Tests for search-root normalization, overlap detection, and document scanning."""

import pytest

from mcp_server_local_search import db, roots
from mcp_server_local_search.roots import RootError


@pytest.fixture
def conn():
    connection = db.connect(":memory:")
    db.initialize(connection)
    yield connection
    connection.close()


class TestNormalize:
    def test_makes_absolute(self, tmp_path):
        assert roots.normalize(str(tmp_path)).is_absolute()

    def test_strips_trailing_separator(self, tmp_path):
        assert roots.normalize(f"{tmp_path}/") == roots.normalize(str(tmp_path))

    def test_resolves_symlink_to_the_same_key(self, tmp_path):
        real = tmp_path / "real"
        real.mkdir()
        link = tmp_path / "link"
        link.symlink_to(real)
        assert roots.normalize(str(link)) == roots.normalize(str(real))

    def test_rejects_blank(self):
        with pytest.raises(RootError):
            roots.normalize("   ")


class TestValidate:
    def test_accepts_readable_directory(self, tmp_path):
        roots.validate(tmp_path)

    def test_rejects_missing_path(self, tmp_path):
        with pytest.raises(RootError, match="存在しません"):
            roots.validate(tmp_path / "nope")

    def test_rejects_file(self, tmp_path):
        target = tmp_path / "a.md"
        target.write_text("x")
        with pytest.raises(RootError, match="ディレクトリではありません"):
            roots.validate(target)


class TestFindConflict:
    """Overlapping roots would scan the same file twice and collide on files.path."""

    def test_none_when_unrelated(self, tmp_path):
        assert roots.find_conflict(tmp_path / "a", [tmp_path / "b"]) is None

    def test_detects_identical(self, tmp_path):
        assert roots.find_conflict(tmp_path, [tmp_path]) is not None

    def test_detects_new_inside_existing(self, tmp_path):
        assert "含まれています" in (roots.find_conflict(tmp_path / "a" / "b", [tmp_path / "a"]) or "")

    def test_detects_new_containing_existing(self, tmp_path):
        assert "含んでいます" in (roots.find_conflict(tmp_path / "a", [tmp_path / "a" / "b"]) or "")

    def test_none_against_empty_list(self, tmp_path):
        assert roots.find_conflict(tmp_path, []) is None


class TestIterDocuments:
    def test_finds_supported_extensions(self, tmp_path):
        (tmp_path / "a.md").write_text("x")
        (tmp_path / "b.pdf").write_bytes(b"x")
        (tmp_path / "c.docx").write_bytes(b"x")
        found = {p.name for p in roots.iter_documents(tmp_path)}
        assert found == {"a.md", "b.pdf", "c.docx"}

    def test_ignores_unsupported_extensions(self, tmp_path):
        (tmp_path / "a.py").write_text("x")
        (tmp_path / "b.json").write_text("{}")
        (tmp_path / "c.xlsx").write_bytes(b"x")
        assert list(roots.iter_documents(tmp_path)) == []

    def test_matches_uppercase_extensions(self, tmp_path):
        (tmp_path / "A.PDF").write_bytes(b"x")
        assert {p.name for p in roots.iter_documents(tmp_path)} == {"A.PDF"}

    def test_descends_into_subdirectories(self, tmp_path):
        nested = tmp_path / "one" / "two"
        nested.mkdir(parents=True)
        (nested / "deep.md").write_text("x")
        assert {p.name for p in roots.iter_documents(tmp_path)} == {"deep.md"}

    def test_skips_hidden_and_known_noise_directories(self, tmp_path):
        for noisy in (".git", "node_modules", "__pycache__"):
            d = tmp_path / noisy
            d.mkdir()
            (d / "junk.md").write_text("x")
        (tmp_path / "keep.md").write_text("x")
        assert {p.name for p in roots.iter_documents(tmp_path)} == {"keep.md"}

    def test_non_recursive_stays_at_top_level(self, tmp_path):
        (tmp_path / "top.md").write_text("x")
        nested = tmp_path / "sub"
        nested.mkdir()
        (nested / "deep.md").write_text("x")
        assert {p.name for p in roots.iter_documents(tmp_path, recursive=False)} == {"top.md"}

    def test_survives_symlink_loop(self, tmp_path):
        inner = tmp_path / "inner"
        inner.mkdir()
        (inner / "a.md").write_text("x")
        (inner / "loop").symlink_to(tmp_path)
        assert {p.name for p in roots.iter_documents(tmp_path)} == {"a.md"}


class TestCountDocuments:
    def test_counts_all(self, tmp_path):
        for i in range(5):
            (tmp_path / f"{i}.md").write_text("x")
        assert roots.count_documents(tmp_path) == 5

    def test_stops_at_limit(self, tmp_path):
        for i in range(10):
            (tmp_path / f"{i}.md").write_text("x")
        assert roots.count_documents(tmp_path, limit=3) == 3


class TestPersistence:
    def test_insert_and_find(self, conn, tmp_path):
        root_id = roots.insert_root(conn, tmp_path, recursive=True)
        row = roots.find_root(conn, tmp_path)
        assert row is not None
        assert row["root_id"] == root_id
        assert row["recursive"] == 1

    def test_existing_paths_round_trips(self, conn, tmp_path):
        roots.insert_root(conn, tmp_path, recursive=True)
        assert roots.existing_paths(conn) == [tmp_path]

    def test_stats_are_zero_without_files(self, conn, tmp_path):
        root_id = roots.insert_root(conn, tmp_path, recursive=True)
        assert roots.root_file_stats(conn, root_id) == (0, 0, 0)

    def test_stats_count_by_status(self, conn, tmp_path):
        root_id = roots.insert_root(conn, tmp_path, recursive=True)
        conn.executemany(
            "insert into files(root_id, path, ext, size, mtime_ns, status) "
            "values (?, ?, '.md', 1, 1, ?)",
            [(root_id, "/a", "indexed"), (root_id, "/b", "failed"), (root_id, "/c", "skipped")],
        )
        assert roots.root_file_stats(conn, root_id) == (1, 1, 1)

    def test_removing_root_cascades_to_files(self, conn, tmp_path):
        root_id = roots.insert_root(conn, tmp_path, recursive=True)
        conn.execute(
            "insert into files(root_id, path, ext, size, mtime_ns, status) "
            "values (?, '/a', '.md', 1, 1, 'indexed')",
            (root_id,),
        )
        conn.execute("delete from search_roots where root_id = ?", (root_id,))
        assert conn.execute("select count(*) as n from files").fetchone()["n"] == 0
