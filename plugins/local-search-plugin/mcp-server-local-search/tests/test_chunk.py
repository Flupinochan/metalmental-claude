"""Tests for chunking. Line numbers must stay exact because search returns them."""

from itertools import pairwise

from mcp_server_local_search.chunk import chunk_lines


def _lines(text: str) -> list[str]:
    return text.splitlines()


class TestLineNumbers:
    """A hit is useless if its line range does not point at the matching text."""

    def test_every_chunk_line_falls_inside_its_range(self):
        """Blank lines are dropped, so the text is a subset of the range, not a substring."""
        lines = [f"行{i}の内容です" for i in range(1, 61)]
        for chunk in chunk_lines(lines, chunk_chars=100, overlap_chars=0):
            within = set(lines[chunk.start_line - 1 : chunk.end_line])
            assert set(chunk.text.split("\n")) <= within

    def test_ranges_hold_even_when_blank_lines_are_interleaved(self):
        lines = []
        for i in range(1, 21):
            lines.extend([f"段落{i}の本文です", ""])
        for chunk in chunk_lines(lines, chunk_chars=60, overlap_chars=0):
            within = set(lines[chunk.start_line - 1 : chunk.end_line])
            assert set(chunk.text.split("\n")) <= within
            assert lines[chunk.start_line - 1].strip()
            assert lines[chunk.end_line - 1].strip()

    def test_first_chunk_starts_at_line_one(self):
        chunks = chunk_lines(_lines("最初の行\n次の行\n三行目"))
        assert chunks[0].start_line == 1

    def test_skips_leading_blank_lines(self):
        chunks = chunk_lines(["", "", "本文はここから"])
        assert chunks[0].start_line == 3

    def test_ranges_never_exceed_the_input(self):
        lines = [f"内容{i}" for i in range(40)]
        for chunk in chunk_lines(lines, chunk_chars=50):
            assert 1 <= chunk.start_line <= chunk.end_line <= len(lines)

    def test_ordinals_are_sequential(self):
        chunks = chunk_lines([f"行{i}の内容" for i in range(50)], chunk_chars=60)
        assert [c.ordinal for c in chunks] == list(range(len(chunks)))


class TestSizing:
    def test_stays_near_the_target_size(self):
        chunks = chunk_lines([f"行{i}の内容です" for i in range(100)], chunk_chars=200)
        assert all(len(c.text) <= 250 for c in chunks)

    def test_short_input_becomes_one_chunk(self):
        assert len(chunk_lines(_lines("短い文書\nもう一行"))) == 1

    def test_merges_a_tiny_tail_into_the_previous_chunk(self):
        lines = [f"それなりに長い行の内容です{i}" for i in range(12)] + ["末尾"]
        chunks = chunk_lines(lines, chunk_chars=120, overlap_chars=0, min_chunk_chars=100)
        assert chunks[-1].end_line == len(lines)

    def test_splits_a_single_oversized_line(self):
        chunks = chunk_lines(["あ" * 5000], chunk_chars=800, max_chunk_chars=2000)
        assert len(chunks) == 3
        assert all(c.start_line == 1 and c.end_line == 1 for c in chunks)


class TestOverlap:
    def test_consecutive_chunks_share_context(self):
        lines = [f"行{i}の内容です" for i in range(60)]
        chunks = chunk_lines(lines, chunk_chars=150, overlap_chars=60)
        assert chunks[1].start_line <= chunks[0].end_line

    def test_zero_overlap_does_not_repeat_lines(self):
        lines = [f"行{i}の内容です" for i in range(60)]
        chunks = chunk_lines(lines, chunk_chars=150, overlap_chars=0)
        for previous, following in pairwise(chunks):
            assert following.start_line > previous.end_line

    def test_overlap_still_terminates(self):
        chunks = chunk_lines([f"行{i}の内容です" for i in range(200)], chunk_chars=100, overlap_chars=90)
        assert 0 < len(chunks) < 500


class TestBoundaries:
    def test_headings_start_a_new_chunk(self):
        lines = _lines("# 見出しA\n本文A\n# 見出しB\n本文B")
        chunks = chunk_lines(lines, chunk_chars=999, overlap_chars=0, min_chunk_chars=1)
        assert [(c.start_line, c.end_line) for c in chunks] == [(1, 2), (3, 4)]

    def test_a_short_tail_still_merges_across_a_heading(self):
        lines = _lines("# 見出しA\n本文A\n# 見出しB\n本文B")
        chunks = chunk_lines(lines, chunk_chars=12, overlap_chars=0)
        assert len(chunks) == 1
        assert (chunks[0].start_line, chunks[0].end_line) == (1, 4)

    def test_blank_lines_are_dropped_from_output(self):
        chunks = chunk_lines(_lines("一行目\n\n\n二行目"))
        assert "\n\n" not in chunks[0].text


class TestEdgeCases:
    def test_empty_input(self):
        assert chunk_lines([]) == []

    def test_only_blank_lines(self):
        assert chunk_lines(["", "   ", "\t"]) == []

    def test_single_line(self):
        chunks = chunk_lines(["ひとつだけ"])
        assert len(chunks) == 1
        assert chunks[0].start_line == chunks[0].end_line == 1
