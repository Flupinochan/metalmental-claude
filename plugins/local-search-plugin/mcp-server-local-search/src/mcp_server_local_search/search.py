import re
import sqlite3
import time
from dataclasses import dataclass
from typing import Protocol

from sqlite_vec import serialize_float32

from .config import FTS_MIN_QUERY_CHARS, RRF_K
from .models import SearchHit, SearchResult

_TOKEN = re.compile(r"[^\s　]+")

# Hiragana, katakana, CJK ideographs, and halfwidth katakana. Latin-1 accents are excluded
# on purpose: splitting them into grams costs precision the way splitting English does.
_CJK = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]")

NGRAM_SIZE = 3

OVERFETCH_FACTOR = 5
OVERFETCH_FLOOR = 50
OVERFETCH_GROWTH = 4
OVERFETCH_ATTEMPTS = 3


@dataclass(frozen=True)
class Candidate:
    chunk_id: int
    file_path: str
    text_path: str
    ext: str
    start_line: int
    end_line: int
    raw_score: float


def split_terms(query: str) -> list[str]:
    return _TOKEN.findall(query.strip())


def escape_term(term: str) -> str:
    """Wrap a term as an FTS5 phrase.

    Bare user input hits syntax errors on reserved words (AND, NOT), operators, and stray
    quotes; quoting turns any of it into a literal phrase.
    """
    return '"' + term.replace('"', '""') + '"'


def build_match_query(terms: list[str]) -> str | None:
    """Build an AND query from terms long enough for the trigram tokenizer."""
    usable = [t for t in terms if len(t) >= FTS_MIN_QUERY_CHARS]
    if not usable:
        return None
    return " ".join(escape_term(term) for term in usable)


def expand_term(term: str) -> list[str]:
    """Break a CJK term into overlapping grams, leaving other terms whole.

    Japanese has no spaces, so a whole phrase rarely appears verbatim in a document.
    Latin words do appear verbatim, and gramming them matches unrelated text.
    """
    if not _CJK.search(term) or len(term) <= NGRAM_SIZE:
        return [term]
    return [term[at : at + NGRAM_SIZE] for at in range(len(term) - NGRAM_SIZE + 1)]


def build_relaxed_query(terms: list[str]) -> str | None:
    """Build an OR query over expanded terms, for when the AND query finds nothing."""
    usable = [t for t in terms if len(t) >= FTS_MIN_QUERY_CHARS]
    if not usable:
        return None
    grams = {gram for term in usable for gram in expand_term(term)}
    return " OR ".join(escape_term(gram) for gram in sorted(grams))


def _select(where: str) -> str:
    return (
        "select c.chunk_id, f.path as file_path, "
        "       coalesce(f.text_path, f.path) as text_path, f.ext, "
        "       c.start_line, c.end_line, {score} as raw_score "
        "from chunks c join files f on f.file_id = c.file_id "
        f"{where}"
    )


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _filters(path_prefix: str | None, extensions: list[str] | None) -> tuple[str, list]:
    clauses, params = [], []
    if path_prefix:
        clauses.append("f.path like ? escape '\\'")
        params.append(_like(path_prefix)[1:])
    if extensions:
        normalized = [e if e.startswith(".") else f".{e}" for e in (x.lower() for x in extensions)]
        clauses.append(f"f.ext in ({','.join('?' * len(normalized))})")
        params.extend(normalized)
    return (" and " + " and ".join(clauses) if clauses else ""), params


def _match_rows(
    conn: sqlite3.Connection,
    match: str,
    short: list[str],
    filter_sql: str,
    filter_params: list,
    limit: int,
) -> list[sqlite3.Row]:
    """Run one FTS5 MATCH, narrowed by terms too short for the trigram index."""
    extra = " and ".join("c.text like ? escape '\\'" for _ in short)
    sql = (
        _select(
            "join chunks_fts on chunks_fts.rowid = c.chunk_id "
            "where chunks_fts match ?" + (f" and {extra}" if extra else "") + filter_sql
        ).format(score="bm25(chunks_fts)")
        + " order by raw_score limit ?"
    )
    return conn.execute(sql, [match, *[_like(t) for t in short], *filter_params, limit]).fetchall()


def fulltext_candidates(
    conn: sqlite3.Connection,
    query: str,
    limit: int,
    path_prefix: str | None = None,
    extensions: list[str] | None = None,
) -> tuple[list[Candidate], list[str]]:
    """Rank chunks by bm25, relaxing the query when an exact-phrase AND finds nothing."""
    terms = split_terms(query)
    if not terms:
        return [], ["検索語が空です"]

    notes: list[str] = []
    filter_sql, filter_params = _filters(path_prefix, extensions)
    match = build_match_query(terms)
    short = [t for t in terms if len(t) < FTS_MIN_QUERY_CHARS]

    if match is not None:
        rows = _match_rows(conn, match, short, filter_sql, filter_params, limit)
        if not rows:
            relaxed = build_relaxed_query(terms)
            if relaxed is not None and relaxed != match:
                rows = _match_rows(conn, relaxed, short, filter_sql, filter_params, limit)
                if rows:
                    notes.append(
                        "完全一致では見つからなかったため、語を分解した部分一致で再検索しました"
                    )
    else:
        notes.append(
            f"検索語がすべて{FTS_MIN_QUERY_CHARS}文字未満のため、索引を使わない部分一致で検索しました"
        )
        clauses = " and ".join("c.text like ? escape '\\'" for _ in terms)
        sql = (
            _select(f"where {clauses}" + filter_sql).format(score="0.0")
            + " order by c.chunk_id limit ?"
        )
        rows = conn.execute(sql, [*[_like(t) for t in terms], *filter_params, limit]).fetchall()

    return [
        Candidate(
            chunk_id=row["chunk_id"],
            file_path=row["file_path"],
            text_path=row["text_path"],
            ext=row["ext"],
            start_line=row["start_line"],
            end_line=row["end_line"],
            raw_score=float(row["raw_score"]),
        )
        for row in rows
    ], notes


def normalize_bm25(candidates: list[Candidate]) -> list[float]:
    """Map bm25 onto 0..1, where bm25 is negative and more negative means better."""
    if not candidates:
        return []
    scores = [-c.raw_score for c in candidates]
    low, high = min(scores), max(scores)
    if high == low:
        return [1.0] * len(scores)
    return [(value - low) / (high - low) for value in scores]


def to_hits(candidates: list[Candidate], scores: list[float], mode: str) -> list[SearchHit]:
    hits = []
    for rank, (candidate, score) in enumerate(zip(candidates, scores, strict=True), start=1):
        hits.append(
            SearchHit(
                rank=rank,
                file_path=candidate.file_path,
                text_path=candidate.text_path,
                ext=candidate.ext,
                start_line=candidate.start_line,
                end_line=candidate.end_line,
                score=round(score, 6),
            )
        )
    return hits


def search_fulltext(
    conn: sqlite3.Connection,
    query: str,
    limit: int = 10,
    path_prefix: str | None = None,
    extensions: list[str] | None = None,
) -> SearchResult:
    started = time.perf_counter()
    candidates, notes = fulltext_candidates(conn, query, limit, path_prefix, extensions)
    hits = to_hits(candidates, normalize_bm25(candidates), "fulltext")
    return SearchResult(
        query=query,
        mode="fulltext",
        hits=hits,
        total_candidates=len(candidates),
        elapsed_ms=int((time.perf_counter() - started) * 1000),
        notes=notes,
    )


class Encoder(Protocol):
    def encode(self, texts: list[str]) -> list[list[float]]: ...


def semantic_candidates(
    conn: sqlite3.Connection,
    query: str,
    encoder: Encoder,
    limit: int,
    path_prefix: str | None = None,
    extensions: list[str] | None = None,
) -> tuple[list[Candidate], list[str]]:
    """Rank chunks by cosine distance, widening k until the filters leave enough rows.

    vec0 applies k before any join, so a narrow filter can leave nothing; growing k and
    finally scanning every candidate keeps a filtered search from returning empty.
    """
    if not query.strip():
        return [], ["検索語が空です"]

    vectors = encoder.encode([query])
    if not vectors:
        return [], ["検索語を埋め込めませんでした"]
    embedding = serialize_float32(vectors[0])

    filter_sql, filter_params = _filters(path_prefix, extensions)
    total = conn.execute("select count(*) as n from chunks_vec").fetchone()["n"]
    if total == 0:
        return [], ["インデックスが空です。start_indexing を実行してください"]

    notes: list[str] = []
    k = max(limit * OVERFETCH_FACTOR, OVERFETCH_FLOOR)
    rows = []
    for attempt in range(OVERFETCH_ATTEMPTS + 1):
        if attempt == OVERFETCH_ATTEMPTS:
            k = total
        sql = (
            _select(
                "join chunks_vec v on v.chunk_id = c.chunk_id "
                "where v.embedding match ? and k = ?" + filter_sql
            ).format(score="v.distance")
            + " order by raw_score limit ?"
        )
        rows = conn.execute(sql, [embedding, min(k, total), *filter_params, limit]).fetchall()
        if len(rows) >= limit or k >= total:
            break
        k *= OVERFETCH_GROWTH

    if filter_sql and len(rows) < limit and k >= total:
        notes.append("絞り込み条件に一致する候補が少なく、全件を走査しました")

    return [
        Candidate(
            chunk_id=row["chunk_id"],
            file_path=row["file_path"],
            text_path=row["text_path"],
            ext=row["ext"],
            start_line=row["start_line"],
            end_line=row["end_line"],
            raw_score=float(row["raw_score"]),
        )
        for row in rows
    ], notes


def search_semantic(
    conn: sqlite3.Connection,
    query: str,
    encoder: Encoder,
    limit: int = 10,
    path_prefix: str | None = None,
    extensions: list[str] | None = None,
) -> SearchResult:
    started = time.perf_counter()
    candidates, notes = semantic_candidates(conn, query, encoder, limit, path_prefix, extensions)
    scores = [max(0.0, 1.0 - candidate.raw_score) for candidate in candidates]
    return SearchResult(
        query=query,
        mode="semantic",
        hits=to_hits(candidates, scores, "semantic"),
        total_candidates=len(candidates),
        elapsed_ms=int((time.perf_counter() - started) * 1000),
        notes=notes,
    )


def rrf_fuse(
    rankings: list[list[Candidate]], k: int = RRF_K
) -> list[tuple[Candidate, float, dict[int, int]]]:
    """Merge ranked lists by reciprocal rank.

    Only positions matter, so bm25 and cosine distance combine without normalization.
    """
    scores: dict[int, float] = {}
    positions: dict[int, dict[int, int]] = {}
    seen: dict[int, Candidate] = {}
    for source, ranking in enumerate(rankings):
        for rank, candidate in enumerate(ranking, start=1):
            scores[candidate.chunk_id] = scores.get(candidate.chunk_id, 0.0) + 1.0 / (k + rank)
            positions.setdefault(candidate.chunk_id, {})[source] = rank
            seen.setdefault(candidate.chunk_id, candidate)
    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    return [(seen[chunk_id], score, positions[chunk_id]) for chunk_id, score in ordered]


def search_hybrid(
    conn: sqlite3.Connection,
    query: str,
    encoder: Encoder,
    limit: int = 10,
    path_prefix: str | None = None,
    extensions: list[str] | None = None,
    rrf_k: int = RRF_K,
) -> SearchResult:
    started = time.perf_counter()
    pool = max(limit * 2, OVERFETCH_FLOOR // 2)

    fts, fts_notes = fulltext_candidates(conn, query, pool, path_prefix, extensions)
    try:
        vec, vec_notes = semantic_candidates(conn, query, encoder, pool, path_prefix, extensions)
    except Exception as exc:  # noqa: BLE001
        # Full-text search needs no model, so a model failure degrades rather than fails.
        vec, vec_notes = [], [f"意味検索を利用できないためキーワード検索のみ使用しました ({exc})"]

    fused = rrf_fuse([fts, vec], rrf_k)[:limit]
    hits = []
    for rank, (candidate, score, positions) in enumerate(fused, start=1):
        hits.append(
            SearchHit(
                rank=rank,
                file_path=candidate.file_path,
                text_path=candidate.text_path,
                ext=candidate.ext,
                start_line=candidate.start_line,
                end_line=candidate.end_line,
                score=round(score, 6),
                fts_rank=positions.get(0),
                vector_rank=positions.get(1),
            )
        )
    return SearchResult(
        query=query,
        mode="hybrid",
        hits=hits,
        total_candidates=len({c.chunk_id for c in [*fts, *vec]}),
        elapsed_ms=int((time.perf_counter() - started) * 1000),
        notes=[*fts_notes, *vec_notes],
    )
