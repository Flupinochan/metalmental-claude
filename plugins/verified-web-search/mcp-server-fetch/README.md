# Fetch MCP Server

指定したURLを取得し、内容をMarkdownまたは生HTMLとして返すMCPサーバー

[Fetch MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch) を改変したもの

## 背景

公式版は `max_length` 引数により、デフォルトで大きいレスポンスを切り詰めるため、不完全な情報が生成AIに渡り、正確な情報をもとに回答しているのか分かりづらいという課題があった

## 解決策

本MCPは、**完全な情報** の取得を `成功` or `失敗` の2択にすることで、不完全な情報をもとに生成AIが回答することをなくした

context容量を考慮し、デフォルトでは `20万文字` を超える場合に `失敗` とするが、`force_full=True` を指定すれば完全な情報を常に取得することも可能

## Available Tools

### `fetch`

指定したURLから `Markdown` または生の `HTML` として返却

| 引数                    | 型      | 必須 | デフォルト | 内容                                                                                                               |
| ----------------------- | ------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `url`                   | string  | 必須 | -          | 取得対象のURL                                                                                                      |
| `raw`                   | boolean | 任意 | false      | true: HTMLを返却<br/>false: Markdownを返却 (HTMLをMarkdown形式に変換しHTMLタグ等を除去することでcontext容量を削減) |
| `force_full`            | boolean | 任意 | false      | true: レスポンスの制限無し<br/>false: レスポンスが20万文字を超える場合はエラーを返却                               |
| `extract_main_content`  | boolean | 任意 | true       | true: 本文のみ抽出しMarkdownで返却 (ナビ/広告/フッタを除去)<br/>false: ページ全体をMarkdownに変換して返却<br/>`raw=true`時は無視 |

## 公式版との違い

### 引数

| 項目          | 公式版                    | 本MCP |
| ------------- | ------------------------- | ----- |
| `max_length`  | あり (デフォルト5000文字) | なし  |
| `start_index` | あり (ページネーション用) | なし  |
| `force_full`  | なし                      | あり  |

### 仕組み

| 項目                     | 公式版                                                   | 本MCP                                                                                             |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 大きいレスポンスの扱い   | `max_length` で切り詰め、続きは `start_index` で取得可能 | 20万文字超過時は `MCPError` が発生し、必要に応じて `force_full=true` で完全なレスポンスを取得可能 |
| 部分的な内容が返る可能性 | あり                                                     | なし                                                                                              |

## その他

### MCP仕様

- 実行方式: stdio
- 起動コマンド
  ```bash
  uv run --project plugins/verified-web-search/mcp-server-fetch mcp-server-fetch
  ```
- Python3.14
- robots.txt
  - tool: 使用
  - prompt: 未使用

### Debugging (MCP Inspector)

```bash
cd /home/metalmental/metalmental-claude/plugins/verified-web-search/mcp-server-fetch
npx @modelcontextprotocol/inspector uv run mcp-server-fetch
```

### Parser
`readabilipy` が `Node.js` に依存しているため `trafilatura` に変更

## 使用ライブラリ

| ライブラリ    | 用途                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `mcp`         | MCP実装                                                                                              |
| `httpx`       | HTTPリクエスト                                                                                       |
| `trafilatura` | HTMLからの本文抽出とMarkdown変換 (ナビゲーション/広告除去。Node.js非依存)                            |
| `markdownify` | `extract_main_content=false`時にページ全体をMarkdownに変換                                          |
| `protego`     | robots.txtのパースとアクセス可否判定                                                                 |
| `pydantic`    | tool引数のスキーマ定義とバリデーション                                                               |

## License

MIT License

- オリジナル: Copyright (c) 2024 Anthropic, PBC.
- 改変: Copyright (c) 2026 MetalMental
