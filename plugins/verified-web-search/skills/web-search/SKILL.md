---
name: web-search
description: このスキルは、ユーザーが「正確な情報をもとに調べてください」「事実をもとに回答してください」「根拠を述べてください」「ソースを教えて」のように質問された場合、WebFetchによる要約された内容の取得では不十分と判断した場合に使用する。ネットで検索した完全な情報をそのまま返却する
allowed-tools: AskUserQuestion Workflow
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
---

# Web Search

## 手順

1. `$ARGUMENTS`を調査したい質問 (`query`) として受け取る。空の場合、以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

   ```
   questions:
     - question: 何を調べたいですか
       header: 調査内容
       multiSelect: false
       options:
         - label: 技術仕様やドキュメントについて
           description: ライブラリ・API・ツールなどの仕様を調べる
         - label: 最新のニュースや動向について
           description: 特定分野の最近の出来事や動きを調べる
   ```

   いずれにも当てはまらない場合は「その他」から具体的な質問文を入力してもらう
2. `Workflow`ツールで`verified-web-search:web-search-workflow`という名前のworkflowを呼び出す
   - この名前で解決しない場合は、bareの`web-search-workflow`で再試行する
   - `args: { "query": "<質問>" }`を渡す。`maxUrls` / `maxVerifyAttempts`は既定値を使うため通常は省略する
3. workflowから返却された結果に応じて表示する
   - `found: true`の場合、`url`と`content` (完全なdocument原文) をそのまま提示する。**要約・省略はしない** (要約が必要なだけならWebFetchで足りるため、このskillを使う意味が無くなる)
   - `otherCandidates`がある場合、URLと判定根拠のみを併記する
   - `found: false`の場合、`message`と`checkedUrls`をそのまま伝える。**回答を捏造しない**

## 出力ルール

- 表記は本リポジトリのCLAUDE.md「表記・出力ルール」節に従う (半角括弧、理由の前置き、水平線不使用、体言止め、文末の「。」不使用)
- 取得した完全なdocumentの内容を書き換えたり、独自の要約を加えたりしない
