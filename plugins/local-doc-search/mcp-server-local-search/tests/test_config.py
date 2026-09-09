"""Tests for data directory resolution and scan exclusion rules."""

from pathlib import Path

from mcp_server_local_search import config


class TestResolveDataDir:
    """plugin.json may hand over an unexpanded placeholder instead of a real path."""

    def test_uses_given_path(self, tmp_path):
        assert config.resolve_data_dir(str(tmp_path)) == tmp_path.resolve()

    def test_expands_home(self):
        assert config.resolve_data_dir("~/somewhere") == (Path.home() / "somewhere").resolve()

    def test_falls_back_on_unexpanded_placeholder(self):
        assert config.resolve_data_dir("${CLAUDE_PLUGIN_DATA}") == config.FALLBACK_DATA_DIR

    def test_falls_back_on_none(self):
        assert config.resolve_data_dir(None) == config.FALLBACK_DATA_DIR

    def test_falls_back_on_empty(self):
        assert config.resolve_data_dir("") == config.FALLBACK_DATA_DIR


class TestPaths:
    def test_all_live_under_data_dir(self, tmp_path):
        for path in (
            config.db_path(tmp_path),
            config.extracted_dir(tmp_path),
            config.model_cache_dir(tmp_path),
        ):
            assert path.parent == tmp_path


class TestExclusions:
    """A user may register their whole home directory, so scanning must skip noise."""

    def test_skips_hidden_directories(self):
        assert config.is_excluded_dir(".git")
        assert config.is_excluded_dir(".cache")

    def test_skips_known_non_document_directories(self):
        assert config.is_excluded_dir("node_modules")
        assert config.is_excluded_dir("__pycache__")

    def test_keeps_ordinary_directories(self):
        assert not config.is_excluded_dir("Documents")
        assert not config.is_excluded_dir("資料")


class TestExtensions:
    def test_plain_text_and_extracted_do_not_overlap(self):
        assert not (config.TEXT_EXTENSIONS & config.EXTRACT_EXTENSIONS)

    def test_supported_is_the_union(self):
        assert config.SUPPORTED_EXTENSIONS == config.TEXT_EXTENSIONS | config.EXTRACT_EXTENSIONS

    def test_spreadsheets_are_out_of_scope_for_v1(self):
        assert ".xlsx" not in config.SUPPORTED_EXTENSIONS
        assert ".rtf" not in config.SUPPORTED_EXTENSIONS
