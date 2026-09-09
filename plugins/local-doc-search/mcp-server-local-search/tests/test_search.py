"""Tests for full-text search: query building, ranking, filters, and fallbacks."""

import pytest
from sqlite_vec import serialize_float32

from mcp_server_local_search import db, search
from mcp_server_local_search.config import EMBEDDING_DIM, FTS_MIN_QUERY_CHARS
from mcp_server_local_search.search import build_match_query, escape_term, split_terms


@pytest.fixture
def indexed(tmp_path):
    conn = db.connect(":memory:")
    db.initialize(conn)
    conn.execute("insert into search_roots(path, added_at) values ('/docs', datetime('now'))")
    documents = [
        ("/docs/tax.md", ".md", "確定申告の書類をまとめる。期限は3月15日まで"),
        ("/docs/city.txt", ".txt", "住民税の通知が届いた。納付は6月から"),
        ("/docs/report.pdf", ".pdf", "上期の売上は前年比120%で推移した"),
        ("/docs/sub/ai.md", ".md", "AI技術の動向を調査する。確定した方針はまだない"),
    ]
    for index, (path, ext, text) in enumerate(documents, start=1):
        conn.execute(
            "insert into files(file_id, root_id, path, ext, size, mtime_ns, text_path, status) "
            "values (?, 1, ?, ?, 100, 1, null, 'indexed')",
            (index, path, ext),
        )
        conn.execute(
            "insert into chunks(file_id, ordinal, start_line, end_line, text) values (?, 0, 1, 3, ?)",
            (index, text),
        )
    conn.commit()
    yield conn
    conn.close()


class TestQueryBuilding:
    def test_splits_on_ascii_and_ideographic_spaces(self):
        assert split_terms("確定申告　書類 期限") == ["確定申告", "書類", "期限"]

    def test_escapes_embedded_quotes(self):
        assert escape_term('確定"申告') == '"確定""申告"'

    def test_wraps_every_term_as_a_phrase(self):
        assert build_match_query(["確定申告", "期限まで"]) == '"確定申告" "期限まで"'

    def test_drops_terms_below_the_trigram_minimum(self):
        assert build_match_query(["AI", "確定申告"]) == '"確定申告"'

    def test_returns_none_when_no_term_is_long_enough(self):
        assert build_match_query(["AI", "税"]) is None


class TestFullTextSearch:
    def test_finds_a_matching_document(self, indexed):
        result = search.search_fulltext(indexed, "確定申告")
        assert [hit.file_path for hit in result.hits] == ["/docs/tax.md"]

    def test_returns_locations_not_text(self, indexed):
        hit = search.search_fulltext(indexed, "確定申告").hits[0]
        assert hit.start_line == 1
        assert hit.end_line == 3
        assert not hasattr(hit, "text")

    def test_plain_text_reads_from_the_original(self, indexed):
        hit = search.search_fulltext(indexed, "確定申告").hits[0]
        assert hit.text_path == hit.file_path

    def test_all_terms_matching_ranks_alone_when_possible(self, indexed):
        result = search.search_fulltext(indexed, "確定申告 書類")
        assert result.total_candidates == 1
        assert result.notes == []

    def test_terms_spread_across_documents_relax_to_a_union(self, indexed):
        """No chunk holds both terms, so the AND pass finds nothing and the relaxed pass runs."""
        result = search.search_fulltext(indexed, "確定申告 住民税")
        assert {hit.file_path for hit in result.hits} == {"/docs/tax.md", "/docs/city.txt"}
        assert any("再検索" in note for note in result.notes)

    def test_ranks_are_sequential_from_one(self, indexed):
        result = search.search_fulltext(indexed, "確定申告")
        assert [hit.rank for hit in result.hits] == list(range(1, len(result.hits) + 1))

    def test_scores_are_normalized(self, indexed):
        result = search.search_fulltext(indexed, "確定申告")
        assert all(0.0 <= hit.score <= 1.0 for hit in result.hits)

    def test_limit_is_honoured(self, indexed):
        assert len(search.search_fulltext(indexed, "確定申告", limit=1).hits) == 1

    def test_no_match_returns_empty(self, indexed):
        result = search.search_fulltext(indexed, "存在しない語句")
        assert result.hits == []
        assert result.total_candidates == 0


class TestShortQueries:
    """The trigram tokenizer cannot index terms shorter than three characters."""

    def test_a_short_query_falls_back_to_a_scan(self, indexed):
        result = search.search_fulltext(indexed, "AI")
        assert [hit.file_path for hit in result.hits] == ["/docs/sub/ai.md"]
        assert any("部分一致" in note for note in result.notes)

    def test_a_single_character_query_also_works(self, indexed):
        result = search.search_fulltext(indexed, "税")
        assert {hit.file_path for hit in result.hits} == {"/docs/city.txt"}

    def test_a_short_term_still_narrows_a_mixed_query(self, indexed):
        """Two-character Japanese words are common, so they must not simply be dropped."""
        assert search.search_fulltext(indexed, "確定申告 書類").total_candidates == 1
        assert search.search_fulltext(indexed, "確定申告 税金").total_candidates == 0

    def test_a_mixed_query_uses_the_index_and_narrows_by_scan(self, indexed):
        result = search.search_fulltext(indexed, "確定申告 期限")
        assert result.notes == []
        assert {hit.file_path for hit in result.hits} == {"/docs/tax.md"}

    def test_all_short_terms_fall_back_together(self, indexed):
        result = search.search_fulltext(indexed, "AI 確定")
        assert any("すべて" in note for note in result.notes)
        assert {hit.file_path for hit in result.hits} == {"/docs/sub/ai.md"}


class TestUnsafeInput:
    """FTS5 rejects reserved words and operators unless the term is quoted."""

    @pytest.mark.parametrize(
        "query", ["NOT", "AND", "OR", "-確定", "確定(申告", "確定*申告", '確定"申告', "*", "()"]
    )
    def test_special_syntax_never_raises(self, indexed, query):
        result = search.search_fulltext(indexed, query)
        assert isinstance(result.hits, list)

    def test_an_empty_query_is_reported(self, indexed):
        result = search.search_fulltext(indexed, "   ")
        assert result.hits == []
        assert result.notes


class TestFilters:
    def test_path_prefix_narrows_results(self, indexed):
        assert {h.file_path for h in search.search_fulltext(indexed, "動向").hits} == {
            "/docs/sub/ai.md"
        }
        result = search.search_fulltext(indexed, "確定申告", path_prefix="/docs/sub")
        assert result.hits == []

    def test_extensions_narrow_results(self, indexed):
        result = search.search_fulltext(indexed, "確定申告", extensions=[".md"])
        assert [hit.ext for hit in result.hits] == [".md"]
        assert search.search_fulltext(indexed, "確定申告", extensions=[".txt"]).hits == []

    def test_extensions_accept_a_missing_dot(self, indexed):
        result = search.search_fulltext(indexed, "確定申告", extensions=["md"])
        assert result.total_candidates > 0

    def test_a_filter_matching_nothing_returns_empty(self, indexed):
        assert search.search_fulltext(indexed, "確定申告", extensions=[".docx"]).hits == []

    def test_a_wildcard_in_the_prefix_is_literal(self, indexed):
        assert search.search_fulltext(indexed, "確定申告", path_prefix="/docs").hits
        assert search.search_fulltext(indexed, "確定申告", path_prefix="/do%").hits == []


class TestNormalizeBm25:
    def test_empty_input(self):
        assert search.normalize_bm25([]) == []

    def test_identical_scores_all_map_to_one(self):
        candidates = [
            search.Candidate(i, "/p", "/p", ".md", 1, 2, -1.5) for i in range(3)
        ]
        assert search.normalize_bm25(candidates) == [1.0, 1.0, 1.0]

    def test_best_bm25_maps_to_one(self):
        candidates = [
            search.Candidate(1, "/a", "/a", ".md", 1, 2, -5.0),
            search.Candidate(2, "/b", "/b", ".md", 1, 2, -1.0),
        ]
        scores = search.normalize_bm25(candidates)
        assert scores[0] == 1.0
        assert scores[1] == 0.0


class TestMetadata:
    def test_reports_the_mode_and_query(self, indexed):
        result = search.search_fulltext(indexed, "確定申告")
        assert result.mode == "fulltext"
        assert result.query == "確定申告"

    def test_reports_elapsed_time(self, indexed):
        assert search.search_fulltext(indexed, "確定申告").elapsed_ms >= 0

    def test_minimum_query_length_matches_the_config(self):
        assert FTS_MIN_QUERY_CHARS == 3


class StubEncoder:
    """Returns whatever vector the test assigns to a query."""

    def __init__(self, mapping: dict[str, list[float]] | None = None, default=None):
        self.mapping = mapping or {}
        self.default = default or [0.0] * EMBEDDING_DIM
        self.queries: list[str] = []

    def encode(self, texts: list[str]) -> list[list[float]]:
        self.queries.extend(texts)
        return [self.mapping.get(text, self.default) for text in texts]


class BrokenEncoder:
    def encode(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("モデルを読み込めません")


def unit(index: int) -> list[float]:
    vector = [0.0] * EMBEDDING_DIM
    vector[index] = 1.0
    return vector


@pytest.fixture
def vectorized(indexed):
    """Give each chunk a distinct basis vector so nearest-neighbour order is predictable."""
    for offset, chunk_id in enumerate(
        row["chunk_id"] for row in indexed.execute("select chunk_id from chunks order by chunk_id")
    ):
        indexed.execute(
            "insert into chunks_vec(chunk_id, embedding) values (?, ?)",
            (chunk_id, serialize_float32(unit(offset))),
        )
    indexed.commit()
    return indexed


class TestSemanticSearch:
    def test_returns_the_nearest_chunk_first(self, vectorized):
        encoder = StubEncoder({"税金の話": unit(0)})
        result = search.search_semantic(vectorized, "税金の話", encoder)
        assert result.hits[0].file_path == "/docs/tax.md"
        assert result.mode == "semantic"

    def test_scores_decrease_with_distance(self, vectorized):
        result = search.search_semantic(vectorized, "q", StubEncoder({"q": unit(1)}))
        assert result.hits[0].score >= result.hits[-1].score

    def test_sends_the_query_to_the_encoder(self, vectorized):
        encoder = StubEncoder()
        search.search_semantic(vectorized, "検索したい内容", encoder)
        assert encoder.queries == ["検索したい内容"]

    def test_an_empty_index_is_reported(self, indexed):
        result = search.search_semantic(indexed, "何か", StubEncoder())
        assert result.hits == []
        assert any("インデックスが空" in note for note in result.notes)

    def test_an_empty_query_is_reported(self, vectorized):
        assert search.search_semantic(vectorized, "  ", StubEncoder()).hits == []

    def test_limit_is_honoured(self, vectorized):
        assert len(search.search_semantic(vectorized, "q", StubEncoder(), limit=2).hits) == 2


class TestSemanticFilters:
    """vec0 applies k before the join, so filters must not silently empty the result."""

    def test_path_prefix_still_finds_a_distant_match(self, vectorized):
        encoder = StubEncoder({"q": unit(0)})
        result = search.search_semantic(vectorized, "q", encoder, limit=1, path_prefix="/docs/sub")
        assert [hit.file_path for hit in result.hits] == ["/docs/sub/ai.md"]

    def test_extension_filter_is_applied(self, vectorized):
        result = search.search_semantic(vectorized, "q", StubEncoder(), extensions=[".pdf"])
        assert all(hit.ext == ".pdf" for hit in result.hits)

    def test_a_filter_matching_nothing_returns_empty(self, vectorized):
        assert search.search_semantic(vectorized, "q", StubEncoder(), extensions=[".xyz"]).hits == []


class TestRrfFuse:
    def _candidate(self, chunk_id: int):
        return search.Candidate(chunk_id, f"/p{chunk_id}", f"/p{chunk_id}", ".md", 1, 2, 0.0)

    def test_ranks_shared_results_above_singletons(self):
        a, b, c = self._candidate(1), self._candidate(2), self._candidate(3)
        fused = search.rrf_fuse([[a, b], [c, a]])
        assert fused[0][0].chunk_id == 1

    def test_keeps_results_seen_by_only_one_side(self):
        a, b = self._candidate(1), self._candidate(2)
        assert {item[0].chunk_id for item in search.rrf_fuse([[a], [b]])} == {1, 2}

    def test_records_the_rank_from_each_list(self):
        a = self._candidate(1)
        positions = search.rrf_fuse([[a], [a]])[0][2]
        assert positions == {0: 1, 1: 1}

    def test_empty_lists_fuse_to_nothing(self):
        assert search.rrf_fuse([[], []]) == []

    def test_a_smaller_k_sharpens_the_top(self):
        a, b = self._candidate(1), self._candidate(2)
        small = search.rrf_fuse([[a, b]], k=1)
        large = search.rrf_fuse([[a, b]], k=1000)
        assert small[0][1] - small[1][1] > large[0][1] - large[1][1]


class TestHybridSearch:
    def test_reports_both_source_ranks(self, vectorized):
        encoder = StubEncoder({"確定申告": unit(0)})
        result = search.search_hybrid(vectorized, "確定申告", encoder)
        top = result.hits[0]
        assert top.fts_rank == 1
        assert top.vector_rank == 1

    def test_a_keyword_only_match_still_appears(self, vectorized):
        result = search.search_hybrid(vectorized, "確定申告", StubEncoder({"確定申告": unit(3)}))
        assert "/docs/tax.md" in {hit.file_path for hit in result.hits}

    def test_degrades_to_keyword_only_when_the_model_fails(self, vectorized):
        result = search.search_hybrid(vectorized, "確定申告", BrokenEncoder())
        assert [hit.file_path for hit in result.hits] == ["/docs/tax.md"]
        assert result.hits[0].vector_rank is None
        assert any("意味検索を利用できない" in note for note in result.notes)

    def test_mode_and_limit(self, vectorized):
        result = search.search_hybrid(vectorized, "確定", StubEncoder(), limit=2)
        assert result.mode == "hybrid"
        assert len(result.hits) <= 2

    def test_ranks_are_sequential(self, vectorized):
        result = search.search_hybrid(vectorized, "確定", StubEncoder())
        assert [hit.rank for hit in result.hits] == list(range(1, len(result.hits) + 1))


class TestExpandTerm:
    """CJK terms are broken into grams; Latin terms are not, because gramming them costs precision."""

    def test_breaks_a_japanese_term_into_overlapping_grams(self):
        assert search.expand_term("移行方法") == ["移行方", "行方法"]

    def test_leaves_a_latin_word_whole(self):
        assert search.expand_term("imapsync") == ["imapsync"]

    def test_leaves_an_accented_latin_word_whole(self):
        assert search.expand_term("résumé") == ["résumé"]

    def test_breaks_halfwidth_katakana(self):
        assert search.expand_term("ﾒｰﾙｻｰﾊﾞ")[0] == "ﾒｰﾙ"

    def test_a_term_at_gram_length_stays_whole(self):
        assert search.expand_term("確定申") == ["確定申"]

    def test_handles_a_query_with_no_spaces(self):
        grams = search.expand_term("Podが起動しない調査方法")
        assert grams[0] == "Pod"
        assert "調査方" in grams


class TestBuildRelaxedQuery:
    def test_joins_grams_with_or(self):
        assert search.build_relaxed_query(["移行方法"]) == '"移行方" OR "行方法"'

    def test_keeps_latin_terms_unbroken(self):
        assert '"imapsync"' in (search.build_relaxed_query(["imapsync", "移行方法"]) or "")

    def test_drops_terms_below_the_trigram_minimum(self):
        assert search.build_relaxed_query(["AI", "移行方法"]) == '"移行方" OR "行方法"'

    def test_returns_none_when_nothing_is_long_enough(self):
        assert search.build_relaxed_query(["AI", "税"]) is None

    def test_deduplicates_repeated_grams(self):
        assert search.build_relaxed_query(["移行方法", "移行方法"]) == '"移行方" OR "行方法"'


@pytest.fixture
def notes_corpus(tmp_path):
    """A corpus where the wording differs from how a user would phrase the query."""
    conn = db.connect(":memory:")
    db.initialize(conn)
    conn.execute("insert into search_roots(path, added_at) values ('/n', datetime('now'))")
    documents = [
        ("/n/ffmpeg.md", ".md", "ffmpegで差分領域だけを切り出す。diff_mode=rectangle を指定する"),
        ("/n/imapsync.md", ".md", "imapsync を使ったメールサーバの移行手順をまとめた"),
        ("/n/k8s.md", ".md", "Podが Pending のまま進まないときは kubectl describe pod で確認する"),
        ("/n/mapping.md", ".md", "地図の mapping ライブラリ調査。map の描画をまとめた"),
        ("/n/syntax.md", ".md", "パーサの syntax 定義メモ。sync の話ではない"),
    ]
    for index, (path, ext, text) in enumerate(documents, start=1):
        conn.execute(
            "insert into files(file_id, root_id, path, ext, size, mtime_ns, status) "
            "values (?, 1, ?, ?, 1, 1, 'indexed')",
            (index, path, ext),
        )
        conn.execute(
            "insert into chunks(file_id, ordinal, start_line, end_line, text) values (?, 0, 1, 3, ?)",
            (index, text),
        )
    conn.commit()
    yield conn
    conn.close()


class TestRelaxedFallback:
    """Japanese phrases rarely appear verbatim, which used to leave full-text search empty."""

    def test_a_phrase_absent_from_the_document_still_finds_it(self, notes_corpus):
        result = search.search_fulltext(notes_corpus, "imapsync 移行方法")
        assert result.hits[0].file_path == "/n/imapsync.md"
        assert any("再検索" in note for note in result.notes)

    def test_a_query_without_spaces_finds_its_document(self, notes_corpus):
        result = search.search_fulltext(notes_corpus, "Podが起動しない調査方法")
        assert result.hits[0].file_path == "/n/k8s.md"

    def test_a_synonym_query_reaches_the_right_file(self, notes_corpus):
        result = search.search_fulltext(notes_corpus, "ffmpeg 差分矩形")
        assert result.hits[0].file_path == "/n/ffmpeg.md"

    def test_latin_terms_are_not_grammed_into_unrelated_files(self, notes_corpus):
        """Gramming imapsync would drag in mapping.md and syntax.md."""
        result = search.search_fulltext(notes_corpus, "imapsync 移行方法")
        assert {hit.file_path for hit in result.hits} == {"/n/imapsync.md"}

    def test_an_exact_match_does_not_relax(self, notes_corpus):
        result = search.search_fulltext(notes_corpus, "移行手順")
        assert result.hits[0].file_path == "/n/imapsync.md"
        assert result.notes == []

    def test_a_query_matching_nothing_stays_empty(self, notes_corpus):
        result = search.search_fulltext(notes_corpus, "まったく無関係な語句")
        assert result.hits == []

    def test_filters_still_apply_after_relaxing(self, notes_corpus):
        result = search.search_fulltext(notes_corpus, "imapsync 移行方法", path_prefix="/n/k8s")
        assert result.hits == []


class TestShortTermsSurviveRelaxing:
    """A short term narrows by LIKE, and must keep doing so on the relaxed pass."""

    @pytest.fixture
    def corpus(self):
        conn = db.connect(":memory:")
        db.initialize(conn)
        conn.execute("insert into search_roots(path, added_at) values ('/n', datetime('now'))")
        documents = [
            ("/n/ai.md", "AIツールの導入調査。生産性の向上手法をまとめた"),
            ("/n/other.md", "生産性の向上手法について。業務改善の話"),
        ]
        for index, (path, text) in enumerate(documents, start=1):
            conn.execute(
                "insert into files(file_id, root_id, path, ext, size, mtime_ns, status) "
                "values (?, 1, ?, '.md', 1, 1, 'indexed')",
                (index, path),
            )
            conn.execute(
                "insert into chunks(file_id, ordinal, start_line, end_line, text) "
                "values (?, 0, 1, 3, ?)",
                (index, text),
            )
        conn.commit()
        yield conn
        conn.close()

    def test_the_short_term_excludes_documents_without_it(self, corpus):
        result = search.search_fulltext(corpus, "AI 向上手法")
        assert {hit.file_path for hit in result.hits} == {"/n/ai.md"}


class TestRelaxedNoiseResistance:
    def test_the_right_document_still_ranks_first(self):
        conn = db.connect(":memory:")
        db.initialize(conn)
        conn.execute("insert into search_roots(path, added_at) values ('/n', datetime('now'))")
        rows = [("/n/k8s.md", "Podが Pending のまま進まないときは kubectl describe pod で確認する")]
        rows += [(f"/n/noise{i}.md", f"アンケート調査方法の検討メモ。調査方法は選択式 ({i})") for i in range(60)]
        for index, (path, text) in enumerate(rows, start=1):
            conn.execute(
                "insert into files(file_id, root_id, path, ext, size, mtime_ns, status) "
                "values (?, 1, ?, '.md', 1, 1, 'indexed')",
                (index, path),
            )
            conn.execute(
                "insert into chunks(file_id, ordinal, start_line, end_line, text) "
                "values (?, 0, 1, 3, ?)",
                (index, text),
            )
        conn.commit()
        result = search.search_fulltext(conn, "Podが起動しない調査方法", limit=5)
        assert result.hits[0].file_path == "/n/k8s.md"
        conn.close()


class TestHybridUsesBothRoutes:
    """The fallback exists so RRF has two ranked lists to fuse, not one."""

    def test_fts_rank_is_populated_for_a_japanese_query(self, notes_corpus):
        for chunk_id in [r["chunk_id"] for r in notes_corpus.execute("select chunk_id from chunks")]:
            notes_corpus.execute(
                "insert into chunks_vec(chunk_id, embedding) values (?, ?)",
                (chunk_id, serialize_float32([0.1] * EMBEDDING_DIM)),
            )
        notes_corpus.commit()
        result = search.search_hybrid(notes_corpus, "imapsync 移行方法", StubEncoder())
        top = next(h for h in result.hits if h.file_path == "/n/imapsync.md")
        assert top.fts_rank is not None
        assert top.vector_rank is not None
