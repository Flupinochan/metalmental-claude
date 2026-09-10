---
name: clear-tool-failure-logs
description: このスキルは、ユーザーが「ツール失敗ログを削除して」「ログをクリアして」「ログファイルを片付けて」のように、このプラグインのhookが記録したPostToolUseFailureログファイルを削除したい場合に使用する。破壊的操作のため、ユーザーが明示的に呼び出した場合のみ実行する
disable-model-invocation: true
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: AskUserQuestion Bash(ls "${CLAUDE_PLUGIN_DATA}"/logs/*.log) Bash(wc -l "${CLAUDE_PLUGIN_DATA}"/logs/*.log) Bash(rm "${CLAUDE_PLUGIN_DATA}"/logs/*.log)
---

# Clear Tool Failure Logs

このプラグインのhookが記録した `PostToolUseFailure` ログファイル
(`${CLAUDE_PLUGIN_DATA}/logs/YYYYMMDD.log`) を削除する

## 手順

1. `ls -la "${CLAUDE_PLUGIN_DATA}"/logs/*.log 2>/dev/null` を実行し、既存のログファイルを
   一覧化する (`wc -l` でファイルごとの行数も確認するとよい)。ファイルが1件も無い場合は
   その旨を伝えて処理を終了する
2. 以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

   ```
   questions:
     - question: どのログファイルを削除しますか
       header: 削除範囲
       multiSelect: false
       options:
         - label: すべて削除
           description: 一覧に出た全てのログファイルを削除する
         - label: 特定の日付のみ削除
           description: 8桁の日付 (YYYYMMDD) を尋ね、その日付のログファイルのみ削除する
         - label: 中止
           description: 何も削除しない
   ```

   「特定の日付のみ削除」が選ばれた場合、8桁の日付 (`YYYYMMDD`) を尋ね、
   `${CLAUDE_PLUGIN_DATA}/logs/<日付>.log` のみを削除対象とする
3. 削除を実行する
   - すべて削除: `rm "${CLAUDE_PLUGIN_DATA}"/logs/*.log`
   - 特定の日付: 入力が正規表現 `^[0-9]{8}$` に厳密に一致することを確認したうえで
     `rm "${CLAUDE_PLUGIN_DATA}"/logs/<日付>.log` を実行する。一致しない場合は実行を拒否し
     エラーを報告する (「昨日」「先週」のような相対表現や部分的な日付・範囲指定は解釈しない)
4. 削除したファイル、または該当ファイルが無かった旨を正確に報告する

## 出力ルール

- 表記は本リポジトリのCLAUDE.md「表記・出力ルール」節に従う (半角括弧、理由の前置き、水平線不使用、体言止め、文末の「。」不使用)
