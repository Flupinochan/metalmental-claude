"""Tests for text extraction, encoding detection, and sidecar caching."""

import pytest

from mcp_server_local_search import extract
from mcp_server_local_search.extract import ExtractError

from .conftest import write_docx, write_pdf, write_pptx


class TestDecodeText:
    """Japanese personal machines still hold non-UTF-8 text files."""

    def test_reads_utf8(self):
        assert "日本語" in extract.decode_text("日本語のテキスト".encode())

    def test_reads_cp932(self):
        assert "確定申告" in extract.decode_text("確定申告の書類".encode("cp932"))

    def test_reads_utf8_with_bom(self):
        assert extract.decode_text("見出し".encode("utf-8-sig")).endswith("見出し")

    def test_handles_empty_input(self):
        assert extract.decode_text(b"") == ""


class TestContentHash:
    def test_same_content_hashes_alike(self, tmp_path):
        a, b = tmp_path / "a.md", tmp_path / "b.md"
        a.write_text("同じ内容")
        b.write_text("同じ内容")
        assert extract.content_hash(a) == extract.content_hash(b)

    def test_different_content_hashes_differently(self, tmp_path):
        a, b = tmp_path / "a.md", tmp_path / "b.md"
        a.write_text("内容A")
        b.write_text("内容B")
        assert extract.content_hash(a) != extract.content_hash(b)


class TestPlainText:
    """Plain text is indexed in place, so no sidecar is written."""

    def test_returns_lines_without_a_sidecar(self, tmp_path, extracted_root):
        source = tmp_path / "note.md"
        source.write_text("# 見出し\n本文です\n")
        result = extract.extract(source, extracted_root, "deadbeef")
        assert result.lines == ["# 見出し", "本文です"]
        assert result.text_path is None
        assert not any(extracted_root.iterdir())

    def test_reads_a_cp932_file(self, tmp_path, extracted_root):
        source = tmp_path / "old.txt"
        source.write_bytes("住民税の通知\n二行目".encode("cp932"))
        result = extract.extract(source, extracted_root, "deadbeef")
        assert result.lines == ["住民税の通知", "二行目"]


class TestOfficeAndPdf:
    """These formats have no line numbers of their own, hence the sidecar."""

    def test_extracts_docx_to_a_sidecar(self, tmp_path, extracted_root):
        source = write_docx(tmp_path / "t.docx", "請求書について", ["請求金額は12万円です"])
        digest = extract.content_hash(source)
        result = extract.extract(source, extracted_root, digest)
        assert result.text_path is not None
        assert result.text_path.exists()
        assert any("請求金額は12万円です" in line for line in result.lines)

    def test_extracts_pptx(self, tmp_path, extracted_root):
        source = write_pptx(tmp_path / "t.pptx", "四半期報告", "売上は前年比120%")
        result = extract.extract(source, extracted_root, extract.content_hash(source))
        assert any("四半期報告" in line for line in result.lines)

    def test_extracts_pdf(self, tmp_path, extracted_root):
        source = write_pdf(tmp_path / "t.pdf", ["Invoice for August 2026"])
        result = extract.extract(source, extracted_root, extract.content_hash(source))
        assert any("Invoice" in line for line in result.lines)

    def test_sidecar_lives_under_a_hash_prefixed_bucket(self, tmp_path, extracted_root):
        source = write_docx(tmp_path / "t.docx", "見出し", ["本文"])
        digest = extract.content_hash(source)
        result = extract.extract(source, extracted_root, digest)
        assert result.text_path == extracted_root / digest[:2] / f"{digest}.txt"

    def test_reuses_an_existing_sidecar(self, tmp_path, extracted_root):
        source = write_docx(tmp_path / "t.docx", "見出し", ["本文"])
        digest = extract.content_hash(source)
        first = extract.extract(source, extracted_root, digest)
        assert first.text_path is not None
        first.text_path.write_text("差し替えた内容", encoding="utf-8")
        second = extract.extract(source, extracted_root, digest)
        assert second.lines == ["差し替えた内容"]

    def test_rejects_an_unsupported_extension(self, tmp_path, extracted_root):
        source = tmp_path / "book.xlsx"
        source.write_bytes(b"x")
        with pytest.raises(ExtractError, match="対象外"):
            extract.extract(source, extracted_root, "deadbeef")

    def test_reports_a_corrupt_document(self, tmp_path, extracted_root):
        source = tmp_path / "broken.docx"
        source.write_bytes(b"PK\x03\x04" + b"\x00" * 64)
        with pytest.raises(ExtractError):
            extract.extract(source, extracted_root, "deadbeef")

    def test_falls_back_to_text_when_the_extension_lies(self, tmp_path, extracted_root):
        """MarkItDown sniffs content, so a mislabelled plain-text file still yields text."""
        source = tmp_path / "mislabelled.docx"
        source.write_bytes(b"just plain text")
        result = extract.extract(source, extracted_root, "deadbeef")
        assert result.lines == ["just plain text"]


class TestPruneSidecars:
    def test_removes_unreferenced_sidecars(self, tmp_path, extracted_root):
        source = write_docx(tmp_path / "t.docx", "見出し", ["本文"])
        kept = extract.extract(source, extracted_root, extract.content_hash(source)).text_path
        assert kept is not None
        orphan = extracted_root / "ff" / "ffff.txt"
        orphan.parent.mkdir(parents=True, exist_ok=True)
        orphan.write_text("誰も参照していない")

        assert extract.prune_sidecars(extracted_root, {kept}) == 1
        assert kept.exists()
        assert not orphan.exists()

    def test_is_safe_when_nothing_was_extracted(self, tmp_path):
        assert extract.prune_sidecars(tmp_path / "missing", set()) == 0
