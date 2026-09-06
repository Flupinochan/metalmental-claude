import re
from dataclasses import dataclass

from .config import (
    CHUNK_CHARS,
    CHUNK_OVERLAP_CHARS,
    MAX_CHUNK_CHARS,
    MIN_CHUNK_CHARS,
)

_HEADING = re.compile(r"^#{1,6}\s")


@dataclass(frozen=True)
class Chunk:
    ordinal: int
    start_line: int
    end_line: int
    text: str


def _overlap_start(lines: list[tuple[int, str]], overlap_chars: int) -> int:
    """Index to resume from so the next chunk repeats about overlap_chars of context."""
    if overlap_chars <= 0:
        return len(lines)
    total = 0
    for index in range(len(lines) - 1, -1, -1):
        total += len(lines[index][1]) + 1
        if total >= overlap_chars:
            return index
    return 0


def _split_long_line(number: int, line: str, ordinal: int, limit: int) -> list[Chunk]:
    """Cut a single oversized line by character position, keeping its line number."""
    pieces = [line[at : at + limit] for at in range(0, len(line), limit)]
    return [Chunk(ordinal + offset, number, number, piece) for offset, piece in enumerate(pieces)]


def chunk_lines(
    lines: list[str],
    chunk_chars: int = CHUNK_CHARS,
    overlap_chars: int = CHUNK_OVERLAP_CHARS,
    min_chunk_chars: int = MIN_CHUNK_CHARS,
    max_chunk_chars: int = MAX_CHUNK_CHARS,
) -> list[Chunk]:
    """Split text into chunks that never straddle a line, so line numbers stay exact."""
    numbered = [(number, line) for number, line in enumerate(lines, start=1) if line.strip()]
    if not numbered:
        return []

    chunks: list[Chunk] = []
    pending: list[tuple[int, str]] = []
    size = 0

    def flush() -> None:
        nonlocal pending, size
        if not pending:
            return
        chunks.append(
            Chunk(
                ordinal=len(chunks),
                start_line=pending[0][0],
                end_line=pending[-1][0],
                text="\n".join(text for _, text in pending),
            )
        )
        resume = _overlap_start(pending, overlap_chars)
        pending = pending[resume:] if resume < len(pending) else []
        size = sum(len(text) + 1 for _, text in pending)

    for number, line in numbered:
        if pending and _HEADING.match(line):
            flush()

        if len(line) > max_chunk_chars:
            flush()
            pending, size = [], 0
            for piece in _split_long_line(number, line, len(chunks), max_chunk_chars):
                chunks.append(Chunk(len(chunks), piece.start_line, piece.end_line, piece.text))
            continue

        if size and size + len(line) + 1 > chunk_chars:
            flush()
        pending.append((number, line))
        size += len(line) + 1

    if pending:
        tail = "\n".join(text for _, text in pending)
        if chunks and len(tail) < min_chunk_chars:
            last = chunks[-1]
            merged_lines = sorted({last.start_line, last.end_line, *(n for n, _ in pending)})
            chunks[-1] = Chunk(
                ordinal=last.ordinal,
                start_line=merged_lines[0],
                end_line=merged_lines[-1],
                text=last.text if tail in last.text else f"{last.text}\n{tail}",
            )
        else:
            chunks.append(Chunk(len(chunks), pending[0][0], pending[-1][0], tail))

    return chunks
