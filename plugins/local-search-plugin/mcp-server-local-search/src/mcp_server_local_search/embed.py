import os
import threading
from pathlib import Path

from .config import EMBEDDING_DIM, EMBEDDING_MODEL, model_cache_dir


class EmbedderError(RuntimeError):
    """The embedding model could not be loaded."""


class LazyEmbedder:
    """Loads BGE-M3 on first use.

    The first load downloads several GB, so the server must start without it: a session
    that never searches should never pay that cost.
    """

    def __init__(self, data_dir: Path, model_name: str = EMBEDDING_MODEL):
        self._cache_folder = str(model_cache_dir(data_dir))
        self._model_name = model_name
        self._model = None
        self._lock = threading.Lock()
        self._failure: str | None = None

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    @property
    def failure(self) -> str | None:
        return self._failure

    def load(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is None:
                self._model = self._build()
        return self._model

    def _build(self):
        # cache_folder only covers the model files. Hub transfer (Xet) also writes logs and
        # temporaries under HF_HOME, which defaults to ~/.cache/huggingface and may be
        # read-only, so point the whole HuggingFace home at the plugin data directory.
        os.environ.setdefault("HF_HOME", self._cache_folder)
        os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
        Path(self._cache_folder).mkdir(parents=True, exist_ok=True)

        try:
            from sentence_transformers import SentenceTransformer

            model = SentenceTransformer(
                self._model_name, cache_folder=self._cache_folder, device="cpu"
            )
        except Exception as exc:
            self._failure = str(exc)
            raise EmbedderError(f"埋め込みモデルを読み込めません: {exc}") from exc

        # get_sentence_embedding_dimension is deprecated in sentence-transformers 6
        getter = getattr(model, "get_embedding_dimension", None) or (
            model.get_sentence_embedding_dimension
        )
        dimension = getter()
        if dimension != EMBEDDING_DIM:
            self._failure = f"次元が一致しません: {dimension} != {EMBEDDING_DIM}"
            raise EmbedderError(self._failure)
        self._failure = None
        return model

    def encode(self, texts: list[str]) -> list[list[float]]:
        """Embed texts for storage or for a query.

        BGE-M3 is symmetric, so queries and documents take the same input with no prefix.
        Vectors are normalized because the vec0 table compares them by cosine distance.
        """
        if not texts:
            return []
        model = self.load()
        vectors = model.encode(
            texts, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False
        )
        return [[float(value) for value in row] for row in vectors]
