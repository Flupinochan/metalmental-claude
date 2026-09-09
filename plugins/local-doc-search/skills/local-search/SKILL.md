---
name: local-search
description: このスキルは、ユーザーが「PCの中の資料を探して」「保存してある書類から調べて」「あの文書どこだっけ」「去年の請求書を見つけて」のように、自分のPCに保存されたドキュメント (Markdown/テキスト/PDF/Word/PowerPoint) を探したい場合に使用する。全文検索と意味検索を組み合わせて該当箇所を特定し、必要な範囲だけを読んで回答する
allowed-tools: mcp__plugin_local-doc-search_local-search__search_hybrid, mcp__plugin_local-doc-search_local-search__search_fulltext, mcp__plugin_local-doc-search_local-search__search_semantic, mcp__plugin_local-doc-search_local-search__list_search_paths, mcp__plugin_local-doc-search_local-search__get_index_status, Read
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
---

# Local Search

## 手順

1. `list_search_paths`で検索対象が登録済みか確認する
   - `roots`が空、または`total_chunks`が0の場合、`local-search-setup`スキルへ誘導し、ここで終了する
2. 検索ツールを選ぶ
   - 既定は`search_hybrid`
   - 固有名詞、型番、エラーメッセージなど完全一致を狙う場合のみ`search_fulltext`
   - 言い換えや曖昧な問いで、キーワードが文書に含まれない見込みの場合のみ`search_semantic`
3. ヒットが0件の場合、以下を試してから再検索する
   - クエリが2文字以下なら、語を足して3文字以上にする (索引の制約)
   - `search_fulltext`で0件なら`search_semantic`に切り替える
   - `path_prefix`や`extensions`で絞り込んでいたら外す
4. 各ヒットについて、必要な範囲だけを`Read`で読む
   - `Read(file_path=<text_path>, offset=<start_line - 5>, limit=<end_line - start_line + 15>)`
   - `offset`は1未満にしない
5. 読んだ内容をもとに日本語で回答する

## 出力ルール

- ユーザーに提示するパスは必ず`file_path` (元のファイル) を使う
  - `text_path`はPDFやWord文書から抽出したキャッシュの内部パスであり、ユーザーには見せない
  - 両者が同じ値のこともあるが、判断せず常に`file_path`を提示する
- 対象がプログラマーとは限らないため、パスの羅列ではなくファイル名と該当箇所の内容を日本語で説明する
- `notes`に内容がある場合、検索の制約として簡潔に伝える
- 検索結果に本文は含まれない。`Read`せずに内容を推測して回答しない
- 表記は本リポジトリのCLAUDE.md「表記・出力ルール」節に従う (半角括弧、理由の前置き、水平線不使用、体言止め、文末の「。」不使用)
