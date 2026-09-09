"""Tests for the path-management tools, driven through an in-process MCP client."""

import sqlite3
import threading

import pytest
from mcp import Client
from mcp.shared.exceptions import MCPError

from mcp_server_local_search import db
from mcp_server_local_search.server import build_server


@pytest.fixture
def workspace(tmp_path):
    docs = tmp_path / "docs"
    (docs / "sub").mkdir(parents=True)
    (docs / "a.md").write_text("x")
    (docs / "sub" / "b.pdf").write_bytes(b"x")
    return tmp_path, docs


def client_for(workspace):
    """Open a client per test.

    An async-generator fixture cannot hold this open: pytest-asyncio tears fixtures down in
    a different task, which anyio's cancel scope rejects.
    """
    tmp_path, _ = workspace
    return Client(build_server(tmp_path / "data"))


class TestAddSearchPath:
    async def test_registers_and_counts_documents(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            result = (await client.call_tool("add_search_path", {"path": str(docs)})).structured_content
            assert result["registered"] is True
            assert result["estimated_files"] == 2
            assert result["conflict"] is None

    async def test_ignores_unsupported_and_hidden(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            (docs / "note.xlsx").write_bytes(b"x")
            hidden = docs / ".git"
            hidden.mkdir()
            (hidden / "junk.md").write_text("x")
            result = (await client.call_tool("add_search_path", {"path": str(docs)})).structured_content
            assert result["estimated_files"] == 2

    async def test_refuses_a_child_of_a_registered_root(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            await client.call_tool("add_search_path", {"path": str(docs)})
            result = (
                await client.call_tool("add_search_path", {"path": str(docs / "sub")})
            ).structured_content
            assert result["registered"] is False
            assert "含まれています" in result["conflict"]

    async def test_refuses_a_parent_of_a_registered_root(self, workspace):
        async with client_for(workspace) as client:
            tmp_path, docs = workspace
            await client.call_tool("add_search_path", {"path": str(docs)})
            result = (
                await client.call_tool("add_search_path", {"path": str(tmp_path)})
            ).structured_content
            assert result["registered"] is False
            assert "含んでいます" in result["conflict"]

    async def test_rejects_a_missing_path(self, workspace):
        async with client_for(workspace) as client:
            tmp_path, _ = workspace
            with pytest.raises(MCPError) as exc_info:
                await client.call_tool("add_search_path", {"path": str(tmp_path / "nope")})
            assert "存在しません" in exc_info.value.message

    async def test_rejects_a_file(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            with pytest.raises(MCPError) as exc_info:
                await client.call_tool("add_search_path", {"path": str(docs / "a.md")})
            assert "ディレクトリではありません" in exc_info.value.message

    async def test_non_recursive_counts_only_the_top_level(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            result = (
                await client.call_tool("add_search_path", {"path": str(docs), "recursive": False})
            ).structured_content
            assert result["estimated_files"] == 1

class TestRemoveSearchPath:
    async def test_removes_a_registered_root(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            await client.call_tool("add_search_path", {"path": str(docs)})
            result = (
                await client.call_tool("remove_search_path", {"path": str(docs)})
            ).structured_content
            assert result["removed"] is True

    async def test_reports_an_unregistered_root_without_failing(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            result = (
                await client.call_tool("remove_search_path", {"path": str(docs)})
            ).structured_content
            assert result["removed"] is False
            assert "登録されていません" in result["message"]

class TestListSearchPaths:
    async def test_is_empty_before_anything_is_registered(self, workspace):
        async with client_for(workspace) as client:
            result = (await client.call_tool("list_search_paths", {})).structured_content
            assert result["roots"] == []
            assert result["total_files"] == 0

    async def test_reflects_registration_and_removal(self, workspace):
        async with client_for(workspace) as client:
            _, docs = workspace
            await client.call_tool("add_search_path", {"path": str(docs)})
            listed = (await client.call_tool("list_search_paths", {})).structured_content
            assert [r["path"] for r in listed["roots"]] == [str(docs)]

            await client.call_tool("remove_search_path", {"path": str(docs)})
            listed = (await client.call_tool("list_search_paths", {})).structured_content
            assert listed["roots"] == []

class TestConnectionThreading:
    """The SDK runs sync tool handlers on a worker thread, so the connection must cross threads."""

    def test_connection_is_usable_from_another_thread(self, tmp_path):
        conn = db.connect(tmp_path / "index.db")
        db.initialize(conn)
        errors: list[sqlite3.Error] = []

        def query():
            try:
                conn.execute("select count(*) from files").fetchone()
            except sqlite3.Error as exc:
                errors.append(exc)

        worker = threading.Thread(target=query)
        worker.start()
        worker.join()
        conn.close()
        assert errors == []
