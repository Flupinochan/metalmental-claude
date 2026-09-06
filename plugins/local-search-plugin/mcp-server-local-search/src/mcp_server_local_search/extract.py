import hashlib
from dataclasses import dataclass
from pathlib import Path

from charset_normalizer import from_bytes

from .config import EXTRACT_EXTENSIONS, TEXT_EXTENSIONS


class ExtractError(RuntimeError):
    """The document could not be turned into text."""


@dataclass(frozen=True)
class Extracted:
    lines: list[str]
    text_path: Path | None
    """None when the original file is already readable text and needs no sidecar."""


def content_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def decode_text(raw: bytes) -> str:
    """Decode a plain-text file, guessing the encoding.

    Japanese personal machines still hold CP932 and Shift_JIS files, which fail or garble
    when read as UTF-8.
    """
    if not raw:
        return ""
    best = from_bytes(raw).best()
    if best is None:
        return raw.decode("utf-8", errors="replace")
    return str(best)


def sidecar_path(extracted_root: Path, digest: str) -> Path:
    return extracted_root / digest[:2] / f"{digest}.txt"


def _convert(path: Path) -> str:
    from markitdown import MarkItDown, MarkItDownException

    try:
        return MarkItDown().convert_local(path).markdown
    except MarkItDownException as exc:
        raise ExtractError(f"変換できませんでした: {exc}") from exc
    except Exception as exc:
        raise ExtractError(f"変換中にエラーが発生しました: {exc}") from exc


def extract(path: Path, extracted_root: Path, digest: str) -> Extracted:
    """Produce the lines to index and the path Claude should read.

    Plain text is indexed in place; other formats get a sidecar keyed by content hash, so
    identical files share one and a changed file never reuses a stale extraction.
    """
    suffix = path.suffix.lower()

    if suffix in TEXT_EXTENSIONS:
        try:
            text = decode_text(path.read_bytes())
        except OSError as exc:
            raise ExtractError(f"読み取れませんでした: {exc}") from exc
        return Extracted(lines=text.splitlines(), text_path=None)

    if suffix not in EXTRACT_EXTENSIONS:
        raise ExtractError(f"対象外の形式です: {suffix}")

    target = sidecar_path(extracted_root, digest)
    if target.exists():
        return Extracted(lines=decode_text(target.read_bytes()).splitlines(), text_path=target)

    markdown = _convert(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(markdown, encoding="utf-8")
    return Extracted(lines=markdown.splitlines(), text_path=target)


def prune_sidecars(extracted_root: Path, keep: set[Path]) -> int:
    """Delete sidecars no files row points at any more."""
    removed = 0
    if not extracted_root.exists():
        return 0
    for candidate in extracted_root.glob("*/*.txt"):
        if candidate not in keep:
            candidate.unlink()
            removed += 1
    for bucket in extracted_root.iterdir():
        if bucket.is_dir() and not any(bucket.iterdir()):
            bucket.rmdir()
    return removed
