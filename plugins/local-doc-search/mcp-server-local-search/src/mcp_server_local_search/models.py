from typing import Annotated, Literal

from pydantic import BaseModel, Field

SearchMode = Literal["fulltext", "semantic", "hybrid"]

IndexState = Literal[
    "idle",
    "preparing_model",
    "running",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
]


class SearchHit(BaseModel):
    """One location worth reading. Never carries document text."""

    rank: Annotated[int, Field(description="1-based position in this result set")]
    file_path: Annotated[
        str, Field(description="Absolute path of the original document. Show this to the user.")
    ]
    text_path: Annotated[
        str,
        Field(
            description=(
                "Absolute path to read with the Read tool. Same as file_path for plain text; "
                "for PDF and Office files this is the extracted-text sidecar."
            )
        ),
    ]
    ext: Annotated[str, Field(description="Extension of the original document, e.g. '.pdf'")]
    start_line: Annotated[
        int, Field(description="1-based first line of the match within text_path, inclusive")
    ]
    end_line: Annotated[
        int, Field(description="1-based last line of the match within text_path, inclusive")
    ]
    score: Annotated[
        float, Field(description="Relevance for this mode. Comparable only within one response.")
    ]
    fts_rank: Annotated[
        int | None, Field(default=None, description="Rank in the full-text list, hybrid mode only")
    ] = None
    vector_rank: Annotated[
        int | None, Field(default=None, description="Rank in the vector list, hybrid mode only")
    ] = None


class SearchResult(BaseModel):
    query: str
    mode: SearchMode
    hits: list[SearchHit]
    total_candidates: Annotated[
        int, Field(description="Number of candidates considered before applying limit")
    ]
    elapsed_ms: int
    notes: Annotated[
        list[str], Field(description="Caveats such as short-query fallback")
    ] = []


class SearchRootInfo(BaseModel):
    root_id: int
    path: str
    recursive: bool
    added_at: str
    last_indexed_at: str | None
    indexed_files: int
    failed_files: int
    skipped_files: int


class SearchPathListResult(BaseModel):
    roots: list[SearchRootInfo]
    total_files: int
    total_chunks: int
    db_size_bytes: int


class AddSearchPathResult(BaseModel):
    root_id: int | None
    path: str
    recursive: bool
    registered: bool
    estimated_files: Annotated[
        int, Field(description="Supported documents found by a shallow scan, before indexing")
    ]
    message: str
    conflict: Annotated[
        str | None,
        Field(default=None, description="Why registration was refused, when registered is false"),
    ] = None


class RemoveSearchPathResult(BaseModel):
    path: str
    removed: bool
    deleted_files: int
    deleted_chunks: int
    message: str


class IndexJobStartResult(BaseModel):
    run_id: int | None
    state: IndexState
    targets: list[str]
    already_running: bool
    message: str


class IndexStatusResult(BaseModel):
    state: IndexState
    run_id: int | None
    mode: str | None
    started_at: str | None
    finished_at: str | None
    current_file: str | None
    files_scanned: int
    files_total: int | None
    files_indexed: int
    files_skipped: int
    files_failed: int
    chunks_written: int
    recent_errors: list[str]
    model_ready: Annotated[
        bool, Field(description="False while the embedding model is still downloading or loading")
    ]
    embedding_model: str
    db_size_bytes: int
    total_files: int
    total_chunks: int
    notes: list[str] = []


class CancelResult(BaseModel):
    cancelled: bool
    run_id: int | None
    message: str
