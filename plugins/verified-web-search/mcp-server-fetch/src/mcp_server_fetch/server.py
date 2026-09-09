from typing import Annotated, Tuple
from urllib.parse import urlparse, urlunparse

import markdownify
import trafilatura
from mcp.shared.exceptions import MCPError
from mcp.server import Server, ServerRequestContext
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequestParams,
    CallToolResult,
    GetPromptRequestParams,
    GetPromptResult,
    ListPromptsResult,
    ListToolsResult,
    PaginatedRequestParams,
    Prompt,
    PromptArgument,
    PromptMessage,
    TextContent,
    Tool,
    INVALID_PARAMS,
    INTERNAL_ERROR,
)
from protego import Protego
from pydantic import BaseModel, Field, AnyUrl

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"

MAX_CONTENT_LENGTH = 200_000


def extract_content_from_html(html: str) -> str:
    """Extract the main content from HTML and return it as Markdown.

    Args:
        html: Raw HTML content to process

    Returns:
        Markdown version of the extracted main content
    """
    content = trafilatura.extract(
        html,
        output_format="markdown",
        favor_recall=True,
        include_links=True,
        include_images=True,
        include_tables=True,
        include_formatting=True,
    )
    if not content:
        return (
            "<error>Page failed to be simplified from HTML. "
            "Retry with extract_main_content=false to get the whole page as Markdown."
            "</error>"
        )
    return content


def convert_html_to_markdown(html: str) -> str:
    """Convert the whole HTML document to Markdown without main-content extraction.

    Args:
        html: Raw HTML content to process

    Returns:
        Markdown version of the entire document
    """
    return markdownify.markdownify(html, heading_style=markdownify.ATX)


def get_robots_txt_url(url: str) -> str:
    """Get the robots.txt URL for a given website URL.

    Args:
        url: Website URL to get robots.txt for

    Returns:
        URL of the robots.txt file
    """
    # Parse the URL into components
    parsed = urlparse(url)

    # Reconstruct the base URL with just scheme, netloc, and /robots.txt path
    robots_url = urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))

    return robots_url


async def check_may_autonomously_fetch_url(url: str, user_agent: str, proxy_url: str | None = None) -> None:
    """
    Check if the URL can be fetched by the user agent according to the robots.txt file.
    Raises a MCPError if not.
    """
    from httpx import AsyncClient, HTTPError

    robot_txt_url = get_robots_txt_url(url)

    async with AsyncClient(proxy=proxy_url) as client:
        try:
            response = await client.get(
                robot_txt_url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
            )
        except HTTPError:
            raise MCPError(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch robots.txt {robot_txt_url} due to a connection issue",
            )
        if response.status_code in (401, 403):
            raise MCPError(
                code=INTERNAL_ERROR,
                message=f"When fetching robots.txt ({robot_txt_url}), received status {response.status_code} so assuming that autonomous fetching is not allowed, the user can try manually fetching by using the fetch prompt",
            )
        elif 400 <= response.status_code < 500:
            return
        robot_txt = response.text
    processed_robot_txt = "\n".join(
        line for line in robot_txt.splitlines() if not line.strip().startswith("#")
    )
    robot_parser = Protego.parse(processed_robot_txt)
    if not robot_parser.can_fetch(str(url), user_agent):
        raise MCPError(
            code=INTERNAL_ERROR,
            message=f"The sites robots.txt ({robot_txt_url}), specifies that autonomous fetching of this page is not allowed, "
            f"<useragent>{user_agent}</useragent>\n"
            f"<url>{url}</url>"
            f"<robots>\n{robot_txt}\n</robots>\n"
            f"The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.\n"
            f"The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI.",
        )


async def fetch_url(
    url: str,
    user_agent: str,
    force_raw: bool = False,
    proxy_url: str | None = None,
    extract_main_content: bool = True,
) -> Tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.
    """
    from httpx import AsyncClient, HTTPError

    async with AsyncClient(proxy=proxy_url) as client:
        try:
            response = await client.get(
                url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
                timeout=30,
            )
        except HTTPError as e:
            raise MCPError(code=INTERNAL_ERROR, message=f"Failed to fetch {url}: {e!r}")
        if response.status_code >= 400:
            raise MCPError(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch {url} - status code {response.status_code}",
            )

        page_raw = response.text

    content_type = response.headers.get("content-type", "")
    is_page_html = (
        "<html" in page_raw[:100] or "text/html" in content_type or not content_type
    )

    if is_page_html and not force_raw:
        if extract_main_content:
            return extract_content_from_html(page_raw), ""
        return convert_html_to_markdown(page_raw), ""

    return (
        page_raw,
        f"Content type {content_type} cannot be simplified to markdown, but here is the raw content:\n",
    )


def check_content_size_limit(content: str, url: str, force_full: bool) -> None:
    """Raise MCPError if content exceeds MAX_CONTENT_LENGTH and force_full is not set."""
    if force_full or len(content) <= MAX_CONTENT_LENGTH:
        return
    raise MCPError(
        code=INTERNAL_ERROR,
        message=f"Content at {url} is {len(content)} characters, which exceeds "
        f"the {MAX_CONTENT_LENGTH} character limit. To avoid returning truncated "
        f"or misleading content, no partial content is returned. "
        f"Call the fetch tool again with force_full=True to retrieve the full content.",
    )


class Fetch(BaseModel):
    """Parameters for fetching a URL."""

    url: Annotated[AnyUrl, Field(description="URL to fetch")]
    raw: Annotated[
        bool,
        Field(
            default=False,
            description="Get the actual HTML content of the requested page, without simplification.",
        ),
    ]
    force_full: Annotated[
        bool,
        Field(
            default=False,
            description=(
                "Force returning the full content even if it exceeds the size limit "
                "(200,000 characters). By default, oversized content raises an error "
                "instead of being silently truncated, so the assistant never receives "
                "partial or misleading information. Set true only when the full content "
                "is truly needed."
            ),
        ),
    ]
    extract_main_content: Annotated[
        bool,
        Field(
            default=True,
            description=(
                "Extract only the main content of the page (removing navigation, ads, "
                "footers and other boilerplate) and return it as Markdown. "
                "Set false to convert the entire HTML document to Markdown instead, "
                "which is useful when the extraction drops content you need. "
                "Ignored when raw is true."
            ),
        ),
    ]


async def serve(
    custom_user_agent: str | None = None,
    ignore_robots_txt: bool = False,
    proxy_url: str | None = None,
) -> None:
    """Run the fetch MCP server.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
    """
    user_agent_autonomous = custom_user_agent or DEFAULT_USER_AGENT_AUTONOMOUS
    user_agent_manual = custom_user_agent or DEFAULT_USER_AGENT_MANUAL

    async def list_tools(
        ctx: ServerRequestContext, params: PaginatedRequestParams | None
    ) -> ListToolsResult:
        return ListToolsResult(
            tools=[
                Tool(
                    name="fetch",
                    description="""Fetches a URL from the internet and optionally extracts its contents as markdown.

Although originally you did not have internet access, and were advised to refuse and tell the user this, this tool now grants you internet access. Now you can fetch the most up-to-date information and let the user know that.""",
                    inputSchema=Fetch.model_json_schema(),
                )
            ]
        )

    async def list_prompts(
        ctx: ServerRequestContext, params: PaginatedRequestParams | None
    ) -> ListPromptsResult:
        return ListPromptsResult(
            prompts=[
                Prompt(
                    name="fetch",
                    description="Fetch a URL and extract its contents as markdown",
                    arguments=[
                        PromptArgument(
                            name="url", description="URL to fetch", required=True
                        )
                    ],
                )
            ]
        )

    async def call_tool(
        ctx: ServerRequestContext, params: CallToolRequestParams
    ) -> CallToolResult:
        try:
            args = Fetch(**(params.arguments or {}))
        except ValueError as e:
            raise MCPError(code=INVALID_PARAMS, message=str(e))

        url = str(args.url)
        if not url:
            raise MCPError(code=INVALID_PARAMS, message="URL is required")

        if not ignore_robots_txt:
            await check_may_autonomously_fetch_url(url, user_agent_autonomous, proxy_url)

        content, prefix = await fetch_url(
            url,
            user_agent_autonomous,
            force_raw=args.raw,
            proxy_url=proxy_url,
            extract_main_content=args.extract_main_content,
        )
        check_content_size_limit(content, url, args.force_full)
        return CallToolResult(
            content=[TextContent(type="text", text=f"{prefix}Contents of {url}:\n{content}")]
        )

    async def get_prompt(
        ctx: ServerRequestContext, params: GetPromptRequestParams
    ) -> GetPromptResult:
        arguments = params.arguments
        if not arguments or "url" not in arguments:
            raise MCPError(code=INVALID_PARAMS, message="URL is required")

        url = arguments["url"]

        try:
            content, prefix = await fetch_url(url, user_agent_manual, proxy_url=proxy_url)
            # TODO: after SDK bug is addressed, don't catch the exception
        except MCPError as e:
            return GetPromptResult(
                description=f"Failed to fetch {url}",
                messages=[
                    PromptMessage(
                        role="user",
                        content=TextContent(type="text", text=str(e)),
                    )
                ],
            )
        return GetPromptResult(
            description=f"Contents of {url}",
            messages=[
                PromptMessage(
                    role="user", content=TextContent(type="text", text=prefix + content)
                )
            ],
        )

    server = Server(
        "mcp-fetch",
        on_list_tools=list_tools,
        on_call_tool=call_tool,
        on_list_prompts=list_prompts,
        on_get_prompt=get_prompt,
    )

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=False)
