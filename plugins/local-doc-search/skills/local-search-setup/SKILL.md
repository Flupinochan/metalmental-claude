---
name: local-search-setup
description: このスキルは、ユーザーが「PCの資料を検索できるようにして」「このフォルダを検索対象にして」「インデックスを作り直して」「検索対象を確認したい」のように、ローカル検索の初期設定やインデックス作成、検索対象フォルダの追加削除を求めた場合に使用する。検索そのものはlocal-searchスキルが担当する
allowed-tools: AskUserQuestion, mcp__plugin_local-doc-search_local-search__add_search_path, mcp__plugin_local-doc-search_local-search__remove_search_path, mcp__plugin_local-doc-search_local-search__list_search_paths, mcp__plugin_local-doc-search_local-search__start_indexing, mcp__plugin_local-doc-search_local-search__get_index_status, mcp__plugin_local-doc-search_local-search__cancel_indexing
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
---

# Local Search Setup

## 手順

1. `list_search_paths`で現在の登録状況を確認する
2. 対象フォルダが未指定の場合、以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

   ```
   questions:
     - question: どのフォルダを検索対象にしますか
       header: 検索対象フォルダ
       multiSelect: false
       options:
         - label: Documents (推奨)
           description: 書類が集まるフォルダ、ホームディレクトリ全体より高速に索引化できる
         - label: Desktop
           description: デスクトップ上のファイルを対象にする
   ```

   ホームディレクトリ全体のような広範囲は、インデックス作成に長時間かかるため避けるよう案内する
3. `add_search_path`で登録する
   - `registered`が`false`の場合、`conflict`の内容をそのまま伝える (登録済みフォルダとの重複)
   - `estimated_files`が5000件を超える警告が出た場合、以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

     ```
     questions:
       - question: 対象ファイルが5000件を超えています。続行しますか
         header: 続行確認
         multiSelect: false
         options:
           - label: 続行する
             description: このままインデックス作成を進める
           - label: 中止する
             description: 対象フォルダを見直すため一旦中止する
     ```
4. `start_indexing`でインデックス作成を開始する
   - **初回は埋め込みモデルのダウンロードに数GB、数分から数十分かかる**ことを必ず事前に伝える
   - 2回目以降は変更があったファイルだけを処理するため短時間で終わる
5. `get_index_status`で状態を確認する
   - 完了まで待つ場合、数十秒おきに確認する。頻繁なポーリングはしない
   - `state`の意味: `preparing_model` (モデル準備中)、`running` (作成中)、`completed` (完了)、`failed` (失敗)、`cancelled` (中止)、`interrupted` (前回が中断)
   - `files_failed`が0でない場合、`recent_errors`の内容を伝える
6. 完了したら、`total_files`と`total_chunks`を伝え、`local-search`スキルで検索できる旨を案内する

## その他の操作

- 中止: `cancel_indexing`を実行する。処理済みの分は検索可能なまま残る
- 対象の削除: `remove_search_path`を実行する。**元のドキュメントは削除されず、インデックスのみ削除される**ことを明示する
- 作り直し: `start_indexing`に`mode="full"`を渡す。設定変更後や、検索結果が古いと感じる場合に使う

## 出力ルール

- 対象がプログラマーとは限らないため、専門用語を避けて説明する
  - 「インデックス」は「検索用の目録」のように言い換える
  - `chunks`のような内部概念はユーザーに提示しない
- 長時間かかる処理を始める前に、必ず所要時間の見込みを伝える
- 表記は本リポジトリのCLAUDE.md「表記・出力ルール」節に従う (半角括弧、理由の前置き、水平線不使用、体言止め、文末の「。」不使用)
