"""Tests for lazy model loading. The real model is never downloaded here."""

import pytest

from mcp_server_local_search.config import (
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
    model_cache_dir,
)
from mcp_server_local_search.embed import EmbedderError, LazyEmbedder


class StubModel:
    def __init__(self, dimension: int = EMBEDDING_DIM):
        self.dimension = dimension
        self.calls: list[dict] = []

    def get_embedding_dimension(self) -> int:
        return self.dimension

    def encode(self, texts, **kwargs):
        self.calls.append({"texts": list(texts), **kwargs})
        return [[0.5] * self.dimension for _ in texts]


class TestLaziness:
    """Starting the server must not pay for a multi-gigabyte download."""

    def test_is_not_ready_before_first_use(self, tmp_path):
        assert LazyEmbedder(tmp_path).is_ready is False

    def test_construction_does_not_load(self, tmp_path, monkeypatch):
        loaded = False

        def build(self):
            nonlocal loaded
            loaded = True
            return StubModel()

        monkeypatch.setattr(LazyEmbedder, "_build", build)
        LazyEmbedder(tmp_path)
        assert loaded is False

    def test_encoding_triggers_a_single_load(self, tmp_path, monkeypatch):
        builds = 0

        def build(self):
            nonlocal builds
            builds += 1
            return StubModel()

        monkeypatch.setattr(LazyEmbedder, "_build", build)
        embedder = LazyEmbedder(tmp_path)
        embedder.encode(["一つ目"])
        embedder.encode(["二つ目"])
        assert builds == 1
        assert embedder.is_ready is True

    def test_an_empty_batch_never_loads(self, tmp_path, monkeypatch):
        def build(self):
            raise AssertionError("must not load for an empty batch")

        monkeypatch.setattr(LazyEmbedder, "_build", build)
        assert LazyEmbedder(tmp_path).encode([]) == []


class TestEncoding:
    def test_requests_normalized_vectors(self, tmp_path, monkeypatch):
        """The vec0 table compares by cosine distance, which assumes unit vectors."""
        model = StubModel()
        monkeypatch.setattr(LazyEmbedder, "_build", lambda self: model)
        LazyEmbedder(tmp_path).encode(["本文"])
        assert model.calls[0]["normalize_embeddings"] is True

    def test_sends_the_text_unchanged(self, tmp_path, monkeypatch):
        """BGE-M3 is symmetric, so no query or passage prefix is added."""
        model = StubModel()
        monkeypatch.setattr(LazyEmbedder, "_build", lambda self: model)
        LazyEmbedder(tmp_path).encode(["確定申告"])
        assert model.calls[0]["texts"] == ["確定申告"]

    def test_returns_plain_floats(self, tmp_path, monkeypatch):
        monkeypatch.setattr(LazyEmbedder, "_build", lambda self: StubModel())
        vectors = LazyEmbedder(tmp_path).encode(["a", "b"])
        assert len(vectors) == 2
        assert len(vectors[0]) == EMBEDDING_DIM
        assert all(isinstance(value, float) for value in vectors[0])


class TestFailures:
    def test_a_dimension_mismatch_is_rejected(self, tmp_path, monkeypatch):
        """A wrong-sized vector would be refused by vec0 at insert time instead."""
        def fake_transformer(*args, **kwargs):
            return StubModel(dimension=384)

        import sentence_transformers

        monkeypatch.setattr(sentence_transformers, "SentenceTransformer", fake_transformer)
        with pytest.raises(EmbedderError, match="次元"):
            LazyEmbedder(tmp_path).load()

    def test_a_download_failure_is_reported(self, tmp_path, monkeypatch):
        import sentence_transformers

        def explode(*args, **kwargs):
            raise OSError("ネットワークに接続できません")

        monkeypatch.setattr(sentence_transformers, "SentenceTransformer", explode)
        embedder = LazyEmbedder(tmp_path)
        with pytest.raises(EmbedderError):
            embedder.load()
        assert embedder.failure is not None
        assert embedder.is_ready is False


class TestCacheLocation:
    def test_the_model_stays_inside_the_plugin_data_dir(self, tmp_path, monkeypatch):
        captured = {}

        import sentence_transformers

        def capture(name, **kwargs):
            captured.update(kwargs)
            captured["name"] = name
            return StubModel()

        monkeypatch.setattr(sentence_transformers, "SentenceTransformer", capture)
        LazyEmbedder(tmp_path).load()
        assert captured["cache_folder"] == str(model_cache_dir(tmp_path))
        assert captured["name"] == EMBEDDING_MODEL
        assert captured["device"] == "cpu"
