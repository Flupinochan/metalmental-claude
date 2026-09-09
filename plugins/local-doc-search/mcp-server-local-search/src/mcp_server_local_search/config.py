from pathlib import Path

FALLBACK_DATA_DIR = Path.home() / ".local" / "share" / "local-doc-search"

EMBEDDING_MODEL = "BAAI/bge-m3"
EMBEDDING_DIM = 1024

CHUNK_CHARS = 800
CHUNK_OVERLAP_CHARS = 160
MIN_CHUNK_CHARS = 100
MAX_CHUNK_CHARS = 2000

MAX_FILE_SIZE = 20 * 1024 * 1024
ROOT_FILE_COUNT_WARNING = 5000

RRF_K = 60
FTS_MIN_QUERY_CHARS = 3

TEXT_EXTENSIONS = frozenset({".md", ".markdown", ".txt", ".text", ".rst"})
EXTRACT_EXTENSIONS = frozenset({".pdf", ".docx", ".pptx"})
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | EXTRACT_EXTENSIONS

EXCLUDED_DIR_NAMES = frozenset(
    {
        "node_modules",
        "venv",
        "__pycache__",
        "site-packages",
        "Library",
        "AppData",
        "Applications",
        "System",
    }
)


def resolve_data_dir(raw: str | None) -> Path:
    """Resolve the data directory, falling back when the caller passed an unexpanded value.

    plugin.json passes ${CLAUDE_PLUGIN_DATA}; if Claude Code does not expand it the
    literal placeholder arrives here and must not be taken as a real path.
    """
    if raw and "${" not in raw:
        return Path(raw).expanduser().resolve()
    return FALLBACK_DATA_DIR


def db_path(data_dir: Path) -> Path:
    return data_dir / "index.db"


def extracted_dir(data_dir: Path) -> Path:
    return data_dir / "extracted"


def model_cache_dir(data_dir: Path) -> Path:
    return data_dir / "models"


def is_excluded_dir(name: str) -> bool:
    return name.startswith(".") or name in EXCLUDED_DIR_NAMES
