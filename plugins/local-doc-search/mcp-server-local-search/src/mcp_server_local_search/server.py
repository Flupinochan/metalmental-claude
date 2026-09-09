import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.shared.exceptions import MCPError
from mcp.types import INTERNAL_ERROR, INVALID_PARAMS, ToolAnnotations
from pydantic import Field

from . import db, roots, search
from .config import (
    EMBEDDING_MODEL,
    ROOT_FILE_COUNT_WARNING,
    db_path,
    extracted_dir,
    model_cache_dir,
    resolve_data_dir,
)
from .embed import LazyEmbedder
from .jobs import IndexJobManager, latest_run
from .models import (
    AddSearchPathResult,
    CancelResult,
    IndexJobStartResult,
    IndexState,
    IndexStatusResult,
    RemoveSearchPathResult,
    SearchPathListResult,
    SearchResult,
    SearchRootInfo,
)
from .roots import RootError


@dataclass
class AppContext:
    data_dir: Path
    conn: sqlite3.Connection
    embedder: LazyEmbedder
    index_jobs: IndexJobManager

    @property
    def db_file(self) -> Path:
        return db_path(self.data_dir)


def _prepare(data_dir: Path) -> sqlite3.Connection:
    for directory in (data_dir, extracted_dir(data_dir), model_cache_dir(data_dir)):
        directory.mkdir(parents=True, exist_ok=True)
    conn = db.connect(db_path(data_dir))
    db.initialize(conn)
    db.reconcile_interrupted_runs(conn)
    return conn


def _root_info(conn: sqlite3.Connection, row: sqlite3.Row) -> SearchRootInfo:
    indexed, failed, skipped = roots.root_file_stats(conn, row["root_id"])
    return SearchRootInfo(
        root_id=row["root_id"],
        path=row["path"],
        recursive=bool(row["recursive"]),
        added_at=row["added_at"],
        last_indexed_at=row["last_indexed_at"],
        indexed_files=indexed,
        failed_files=failed,
        skipped_files=skipped,
    )


def _run_error_list(run: sqlite3.Row | None) -> list[str]:
    if run is None or not run["error"]:
        return []
    return [run["error"]]


def build_server(data_dir: Path) -> MCPServer:
    @asynccontextmanager
    async def lifespan(server: MCPServer) -> AsyncIterator[AppContext]:
        conn = _prepare(data_dir)
        embedder = LazyEmbedder(data_dir)
        try:
            yield AppContext(
                data_dir=data_dir,
                conn=conn,
                embedder=embedder,
                index_jobs=IndexJobManager(conn, data_dir, embedder),
            )
        finally:
            conn.close()

    mcp = MCPServer("mcp-local-search", lifespan=lifespan)

    @mcp.tool(
        title="Register a folder to search",
        annotations=ToolAnnotations(read_only_hint=False, open_world_hint=False),
    )
    def add_search_path(
        ctx: Context[AppContext],
        path: Annotated[str, Field(description="Absolute path of a folder holding documents")],
        recursive: Annotated[
            bool, Field(default=True, description="Also index documents in subfolders")
        ] = True,
    ) -> AddSearchPathResult:
        """Register a folder whose documents should become searchable.

        Registering does not index anything: call start_indexing afterwards. Overlapping
        folders are refused, so register the broadest folder you actually want.
        """
        conn = ctx.request_context.lifespan_context.conn
        try:
            target = roots.normalize(path)
            roots.validate(target)
        except RootError as exc:
            raise MCPError(code=INVALID_PARAMS, message=str(exc))

        conflict = roots.find_conflict(target, roots.existing_paths(conn))
        if conflict:
            return AddSearchPathResult(
                root_id=None,
                path=str(target),
                recursive=recursive,
                registered=False,
                estimated_files=0,
                conflict=conflict,
                message=f"登録しませんでした ({conflict})",
            )

        estimated = roots.count_documents(target, recursive, limit=ROOT_FILE_COUNT_WARNING + 1)
        root_id = roots.insert_root(conn, target, recursive)
        message = f"{target} を登録しました。対象ドキュメントは約{estimated}件です"
        if estimated > ROOT_FILE_COUNT_WARNING:
            message = (
                f"{target} を登録しました。対象ドキュメントが{ROOT_FILE_COUNT_WARNING}件を超えるため、"
                "インデックス作成には長時間かかります"
            )
        return AddSearchPathResult(
            root_id=root_id,
            path=str(target),
            recursive=recursive,
            registered=True,
            estimated_files=estimated,
            message=message,
        )

    @mcp.tool(
        title="Unregister a folder",
        annotations=ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False),
    )
    def remove_search_path(
        ctx: Context[AppContext],
        path: Annotated[str, Field(description="Path of a folder returned by list_search_paths")],
    ) -> RemoveSearchPathResult:
        """Stop searching a folder and drop everything indexed from it.

        The documents themselves are never touched, only the index entries.
        """
        conn = ctx.request_context.lifespan_context.conn
        try:
            target = roots.normalize(path)
        except RootError as exc:
            raise MCPError(code=INVALID_PARAMS, message=str(exc))

        row = roots.find_root(conn, target)
        if row is None:
            return RemoveSearchPathResult(
                path=str(target),
                removed=False,
                deleted_files=0,
                deleted_chunks=0,
                message=f"登録されていません: {target}",
            )

        file_ids = [
            r["file_id"]
            for r in conn.execute("select file_id from files where root_id = ?", (row["root_id"],))
        ]
        with db.write_lock:
            deleted_chunks = sum(db.delete_file_chunks(conn, file_id) for file_id in file_ids)
            conn.execute("delete from search_roots where root_id = ?", (row["root_id"],))
            conn.commit()
        return RemoveSearchPathResult(
            path=str(target),
            removed=True,
            deleted_files=len(file_ids),
            deleted_chunks=deleted_chunks,
            message=f"{target} の登録とインデックスを削除しました",
        )

    @mcp.tool(
        title="List registered folders",
        annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
    )
    def list_search_paths(ctx: Context[AppContext]) -> SearchPathListResult:
        """Show which folders are searchable and how much of each is indexed.

        An empty list means nothing is searchable yet.
        """
        app = ctx.request_context.lifespan_context
        conn = app.conn
        total_files, total_chunks = db.counts(conn)
        return SearchPathListResult(
            roots=[_root_info(conn, row) for row in roots.list_roots(conn)],
            total_files=total_files,
            total_chunks=total_chunks,
            db_size_bytes=db.db_size_bytes(app.db_file),
        )

    @mcp.tool(
        title="Start indexing",
        annotations=ToolAnnotations(read_only_hint=False, open_world_hint=False),
    )
    def start_indexing(
        ctx: Context[AppContext],
        paths: Annotated[
            list[str] | None,
            Field(default=None, description="Registered folders to index. Omit for all of them."),
        ] = None,
        mode: Annotated[
            Literal["incremental", "full"],
            Field(default="incremental", description="'full' rebuilds every document"),
        ] = "incremental",
    ) -> IndexJobStartResult:
        """Begin building the search index in the background and return immediately.

        Indexing can take minutes to hours and downloads the embedding model on first use.
        Poll get_index_status to follow it; only one job runs at a time.
        """
        app = ctx.request_context.lifespan_context
        conn = app.conn

        if paths:
            selected = []
            for raw in paths:
                try:
                    row = roots.find_root(conn, roots.normalize(raw))
                except RootError as exc:
                    raise MCPError(code=INVALID_PARAMS, message=str(exc))
                if row is None:
                    raise MCPError(code=INVALID_PARAMS, message=f"登録されていません: {raw}")
                selected.append(row)
        else:
            selected = roots.list_roots(conn)

        if not selected:
            return IndexJobStartResult(
                run_id=None,
                state="idle",
                targets=[],
                already_running=False,
                message="検索対象のフォルダが登録されていません。先に add_search_path を実行してください",
            )

        run_id, already_running = app.index_jobs.start(selected, mode)
        if already_running:
            return IndexJobStartResult(
                run_id=run_id,
                state="running",
                targets=[row["path"] for row in selected],
                already_running=True,
                message="すでにインデックス作成が実行中です",
            )
        return IndexJobStartResult(
            run_id=run_id,
            state="preparing_model" if not app.embedder.is_ready else "running",
            targets=[row["path"] for row in selected],
            already_running=False,
            message=(
                "インデックス作成を開始しました。初回は埋め込みモデルのダウンロードに"
                "数分から数十分かかります"
            ),
        )

    @mcp.tool(
        title="Check indexing progress",
        annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
    )
    def get_index_status(ctx: Context[AppContext]) -> IndexStatusResult:
        """Report how far indexing has got and whether searching is possible yet.

        Returns immediately even while a job is running, so it is safe to poll.
        """
        app = ctx.request_context.lifespan_context
        conn = app.conn
        run = latest_run(conn)
        handle = app.index_jobs.current
        total_files, total_chunks = db.counts(conn)

        state: IndexState = "idle"
        if run is not None:
            state = run["state"]
        if handle is not None and state not in ("preparing_model", "running"):
            state = "running"

        progress = handle.progress if handle is not None else None
        notes = db.settings_mismatches(conn)
        if app.embedder.failure:
            notes.append(
                f"埋め込みモデルを利用できません ({app.embedder.failure})。"
                "search_fulltext のみ利用可能です"
            )

        return IndexStatusResult(
            state=state,
            run_id=run["run_id"] if run else None,
            mode=run["mode"] if run else None,
            started_at=run["started_at"] if run else None,
            finished_at=run["finished_at"] if run else None,
            current_file=progress.current_file if progress else (run["current_file"] if run else None),
            files_scanned=progress.files_scanned if progress else (run["files_scanned"] if run else 0),
            files_total=progress.files_total if progress else (run["files_total"] if run else None),
            files_indexed=progress.files_indexed if progress else (run["files_indexed"] if run else 0),
            files_skipped=progress.files_skipped if progress else (run["files_skipped"] if run else 0),
            files_failed=progress.files_failed if progress else (run["files_failed"] if run else 0),
            chunks_written=progress.chunks_written if progress else (run["chunks_written"] if run else 0),
            recent_errors=list(progress.recent_errors) if progress else _run_error_list(run),
            model_ready=app.embedder.is_ready,
            embedding_model=EMBEDDING_MODEL,
            db_size_bytes=db.db_size_bytes(app.db_file),
            total_files=total_files,
            total_chunks=total_chunks,
            notes=notes,
        )

    @mcp.tool(
        title="Stop indexing",
        annotations=ToolAnnotations(read_only_hint=False, open_world_hint=False),
    )
    def cancel_indexing(ctx: Context[AppContext]) -> CancelResult:
        """Ask the running index job to stop after the document it is on.

        Whatever was already indexed stays searchable.
        """
        app = ctx.request_context.lifespan_context
        run_id = app.index_jobs.cancel()
        if run_id is None:
            return CancelResult(
                cancelled=False, run_id=None, message="実行中のインデックス作成はありません"
            )
        return CancelResult(
            cancelled=True, run_id=run_id, message="インデックス作成の停止を要求しました"
        )

    @mcp.tool(
        title="Search by keyword",
        annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
    )
    def search_fulltext(
        ctx: Context[AppContext],
        query: Annotated[str, Field(description="Words to match literally, e.g. a name or code")],
        limit: Annotated[int, Field(default=10, ge=1, le=50, description="Maximum hits")] = 10,
        path_prefix: Annotated[
            str | None, Field(default=None, description="Only match files under this path")
        ] = None,
        extensions: Annotated[
            list[str] | None,
            Field(default=None, description="Only match these extensions, e.g. ['.pdf']"),
        ] = None,
    ) -> SearchResult:
        """Find documents containing the given words, ranked by keyword relevance.

        Use this for exact wording: names, product codes, error messages. If no document
        contains every word, this relaxes to partial matches and says so in notes. Results
        carry no document text, only where to look: read text_path over start_line..end_line,
        and show the user file_path.
        """
        conn = ctx.request_context.lifespan_context.conn
        return search.search_fulltext(conn, query, limit, path_prefix, extensions)

    @mcp.tool(
        title="Search by meaning",
        annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
    )
    def search_semantic(
        ctx: Context[AppContext],
        query: Annotated[str, Field(description="Describe what you are looking for, in words")],
        limit: Annotated[int, Field(default=10, ge=1, le=50, description="Maximum hits")] = 10,
        path_prefix: Annotated[
            str | None, Field(default=None, description="Only match files under this path")
        ] = None,
        extensions: Annotated[
            list[str] | None,
            Field(default=None, description="Only match these extensions, e.g. ['.pdf']"),
        ] = None,
    ) -> SearchResult:
        """Find documents that mean something similar, even with different wording.

        Use this when the user cannot recall exact words, or when synonyms and other
        languages should match. Requires the embedding model, so it is unavailable until
        indexing has run at least once.
        """
        app = ctx.request_context.lifespan_context
        return search.search_semantic(app.conn, query, app.embedder, limit, path_prefix, extensions)

    @mcp.tool(
        title="Search by keyword and meaning",
        annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False),
    )
    def search_hybrid(
        ctx: Context[AppContext],
        query: Annotated[str, Field(description="What to look for")],
        limit: Annotated[int, Field(default=10, ge=1, le=50, description="Maximum hits")] = 10,
        path_prefix: Annotated[
            str | None, Field(default=None, description="Only match files under this path")
        ] = None,
        extensions: Annotated[
            list[str] | None,
            Field(default=None, description="Only match these extensions, e.g. ['.pdf']"),
        ] = None,
    ) -> SearchResult:
        """Combine keyword and meaning matches into one ranking. Prefer this by default.

        Documents found by both routes rank highest. If the embedding model is unavailable
        this degrades to keyword-only and says so in notes.
        """
        app = ctx.request_context.lifespan_context
        return search.search_hybrid(
            app.conn, query, app.embedder, limit, path_prefix, extensions
        )

    return mcp


def serve(data_dir: str | None = None) -> None:
    resolved = resolve_data_dir(data_dir)
    try:
        build_server(resolved).run(transport="stdio")
    except OSError as exc:
        raise MCPError(code=INTERNAL_ERROR, message=f"データディレクトリを準備できません: {exc}")
