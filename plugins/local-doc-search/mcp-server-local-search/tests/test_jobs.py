"""Tests for the background index job, including the event-loop guarantee."""

import asyncio
import hashlib
import time

from mcp import Client

from mcp_server_local_search import db, jobs, roots
from mcp_server_local_search.config import EMBEDDING_DIM
from mcp_server_local_search.jobs import IndexJobManager
from mcp_server_local_search.server import build_server


def fake_vector(text: str) -> list[float]:
    seed = hashlib.sha256(text.encode()).digest()
    return [seed[i % len(seed)] / 255.0 for i in range(EMBEDDING_DIM)]


class SlowEmbedder:
    """Stands in for BGE-M3: CPU-bound, synchronous, and never awaits."""

    def __init__(self, delay: float = 0.25):
        self.delay = delay
        self.is_ready = True
        self.failure = None

    def encode(self, texts: list[str]) -> list[list[float]]:
        time.sleep(self.delay)
        return [fake_vector(text) for text in texts]


class FailingEmbedder:
    def __init__(self):
        self.is_ready = False
        self.failure = "モデルを取得できません"

    def encode(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("モデルを取得できません")


def make_workspace(tmp_path, count: int = 6):
    data_dir, docs = tmp_path / "data", tmp_path / "docs"
    data_dir.mkdir()
    docs.mkdir()
    for i in range(count):
        (docs / f"{i}.md").write_text(f"文書{i}の本文です。検索対象になります")
    conn = db.connect(data_dir / "index.db")
    db.initialize(conn)
    roots.insert_root(conn, docs, recursive=True)
    return conn, data_dir, docs


class TestJobLifecycle:
    def test_completes_and_records_progress(self, tmp_path):
        conn, data_dir, _ = make_workspace(tmp_path)
        manager = IndexJobManager(conn, data_dir, SlowEmbedder(delay=0))
        run_id, already = manager.start(roots.list_roots(conn), "incremental")
        assert already is False
        assert run_id is not None

        handle = manager.current
        assert handle is not None
        handle.thread.join(timeout=30)

        run = jobs.latest_run(conn)
        assert run is not None
        assert run["state"] == "completed"
        assert run["files_indexed"] == 6
        conn.close()

    def test_refuses_a_second_concurrent_job(self, tmp_path):
        conn, data_dir, _ = make_workspace(tmp_path)
        manager = IndexJobManager(conn, data_dir, SlowEmbedder(delay=0.2))
        first_id, _ = manager.start(roots.list_roots(conn), "incremental")
        second_id, already = manager.start(roots.list_roots(conn), "incremental")
        assert already is True
        assert second_id == first_id

        handle = manager.current
        if handle is not None:
            handle.cancel.set()
            handle.thread.join(timeout=30)
        conn.close()

    def test_cancel_stops_the_run(self, tmp_path):
        conn, data_dir, _ = make_workspace(tmp_path, count=30)
        manager = IndexJobManager(conn, data_dir, SlowEmbedder(delay=0.05))
        manager.start(roots.list_roots(conn), "incremental")
        time.sleep(0.1)
        cancelled_id = manager.cancel()
        assert cancelled_id is not None

        handle = manager.current
        if handle is not None:
            handle.thread.join(timeout=30)
        run = jobs.latest_run(conn)
        assert run is not None
        assert run["state"] == "cancelled"
        conn.close()

    def test_cancel_without_a_job_reports_nothing(self, tmp_path):
        conn, data_dir, _ = make_workspace(tmp_path)
        manager = IndexJobManager(conn, data_dir, SlowEmbedder(delay=0))
        assert manager.cancel() is None
        conn.close()

    def test_a_model_failure_is_recorded_on_the_run(self, tmp_path):
        conn, data_dir, _ = make_workspace(tmp_path)
        manager = IndexJobManager(conn, data_dir, FailingEmbedder())
        manager.start(roots.list_roots(conn), "incremental")
        handle = manager.current
        if handle is not None:
            handle.thread.join(timeout=30)
        run = jobs.latest_run(conn)
        assert run is not None
        assert run["state"] == "failed"
        assert "モデルを取得できません" in run["error"]
        conn.close()


class TestEventLoopIsNotBlocked:
    """The reason indexing runs on a worker thread rather than the event loop."""

    async def test_start_returns_before_indexing_finishes(self, tmp_path):
        """start_indexing must hand back a run id immediately, not after the work."""
        conn, data_dir, docs = make_workspace(tmp_path, count=8)
        conn.close()

        async with Client(build_server(data_dir)) as client:
            await client.call_tool("add_search_path", {"path": str(docs)})
            started = time.perf_counter()
            result = (await client.call_tool("start_indexing", {})).structured_content
            elapsed = time.perf_counter() - started

            assert result["run_id"] is not None
            assert result["already_running"] is False
            status = (await client.call_tool("get_index_status", {})).structured_content
            assert elapsed < 1.0, f"start_indexing blocked for {elapsed:.2f}s"
            assert status["total_files"] < 8 or status["state"] in ("running", "preparing_model")

    async def test_status_answers_promptly_while_indexing(self, tmp_path):
        conn, data_dir, docs = make_workspace(tmp_path, count=8)
        conn.close()

        async with Client(build_server(data_dir)) as client:
            await client.call_tool("add_search_path", {"path": str(docs)})
            await client.call_tool("start_indexing", {})

            latencies = []
            for _ in range(5):
                started = time.perf_counter()
                await client.call_tool("get_index_status", {})
                latencies.append(time.perf_counter() - started)
                await asyncio.sleep(0.05)

            assert max(latencies) < 1.0, f"status calls were blocked: {latencies}"

    async def test_the_loop_keeps_running_during_a_job(self, tmp_path):
        conn, data_dir, docs = make_workspace(tmp_path, count=8)
        conn.close()

        ticks = 0

        async def heartbeat():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.02)
                ticks += 1

        async with Client(build_server(data_dir)) as client:
            await client.call_tool("add_search_path", {"path": str(docs)})
            beat = asyncio.create_task(heartbeat())
            await client.call_tool("start_indexing", {})
            await asyncio.sleep(0.3)
            beat.cancel()

        assert ticks > 5, f"the event loop stalled: {ticks} ticks"


class TestStatusTool:
    async def test_reports_idle_before_any_run(self, tmp_path):
        _, data_dir, _ = make_workspace(tmp_path)
        async with Client(build_server(data_dir)) as client:
            status = (await client.call_tool("get_index_status", {})).structured_content
            assert status["state"] == "idle"
            assert status["model_ready"] is False

    async def test_start_without_registered_folders_is_reported(self, tmp_path):
        data_dir = tmp_path / "empty"
        data_dir.mkdir()
        async with Client(build_server(data_dir)) as client:
            result = (await client.call_tool("start_indexing", {})).structured_content
            assert result["run_id"] is None
            assert "登録されていません" in result["message"]

    async def test_cancel_without_a_job_is_reported(self, tmp_path):
        _, data_dir, _ = make_workspace(tmp_path)
        async with Client(build_server(data_dir)) as client:
            result = (await client.call_tool("cancel_indexing", {})).structured_content
            assert result["cancelled"] is False
