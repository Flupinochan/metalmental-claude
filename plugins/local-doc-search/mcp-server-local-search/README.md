# mcp-server-local-search

ローカルPC上のドキュメントに対し、全文検索とセマンティック検索 (RAG) を提供するMCPサーバー

## 概要

`local-doc-search`に同梱されるMCPサーバー
検索対象のドキュメントをインデックス化し、Claudeに「どのファイルの何行目を読むべきか」だけを返す

本文やチャンクの中身は返さない
Claudeが`Read`ツールで必要な範囲だけを読む two-phase retrieval 方式を採用しているため

## 技術構成

| レイヤー | 採用 |
|---|---|
| 全文検索 | SQLite FTS5 (trigramトークナイザー) |
| ベクトル検索 | sqlite-vec |
| Embedding | BGE-M3 (sentence-transformers) |
| 文書テキスト抽出 | MarkItDown |
| MCP SDK | 公式SDK `mcp` の高レベルAPI `MCPServer` |

同梱の`mcp-server-fetch`は低レベルAPI (`mcp.server.Server`) を使うが、本サーバーは公開ツール数が多くボイラープレートを抑えたいため高レベルAPIを使う

## torchのCPU版固定について

PyPIのLinux向けtorchは`nvidia-cudnn`等のCUDAパッケージを条件付き依存として引き込み、合計で数GBに達する
本サーバーはGPUを使わないため、`pyproject.toml`でPyTorchのCPU版インデックスへ明示的に振り向けている

```toml
[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

[tool.uv.sources]
torch = { index = "pytorch-cpu" }
```

## 開発

```bash
uv sync
uv run pytest
uv run ruff check .
uv run pyright
```
