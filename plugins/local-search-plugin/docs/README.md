# local-search-plugin 仕様書

ローカルPCのドキュメントを全文検索とRAG検索で横断検索するpluginの設計資料

## 構成

| ファイル | 内容 |
|---|---|
| [01-requirements.md](01-requirements.md) | 目的、対象ユーザ、対象ファイル形式、スコープ外 |
| [02-technology-selection.md](02-technology-selection.md) | 技術選定の比較表と却下理由、実測による裏付け |
| [03-architecture.md](03-architecture.md) | 全体構成、DBスキーマ、two-phase retrieval、並行処理 |
| [04-indexing-and-search.md](04-indexing-and-search.md) | 差分同期、チャンク分割、検索3方式、RRF |
| [05-mcp-tools.md](05-mcp-tools.md) | MCPツール9本の仕様と返却仕様 |
| [06-operations.md](06-operations.md) | セットアップ手順、既知の制約、トラブルシュート |

## 読む順序

- 全体像を把握する場合、01 → 03 → 05
- 技術選定の根拠を確認する場合、02
- 検索精度を調整する場合、04
- 利用時に問題が起きた場合、06
