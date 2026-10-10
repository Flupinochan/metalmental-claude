---
name: analyze-tool-failures
description: このスキルは、ユーザーが「ツールの失敗ログを分析して」「なぜツールが失敗し続けるのか調べて」「settings.jsonの修正案を出して」のように、このプラグインが記録したPostToolUseFailureログをもとに設定の改善案を得たい場合に使用する。調査は読み取り専用で、いかなるファイルも変更しない。ユーザーが明示的に呼び出した場合のみ実行する
disable-model-invocation: true
context: fork
agent: settings-fix-advisor
---

# Analyze Tool Failures

`${CLAUDE_PLUGIN_DATA}/logs/*.log` 配下に記録された直近の `PostToolUseFailure` ログを調査し、
現在のClaude Code設定 (グローバルの `~/.claude/settings.json`、および存在する場合はプロジェクト
配下の `.claude/settings.json` / `.claude/settings.local.json`) と突き合わせる

`$ARGUMENTS` には調査期間を指定できる。日数 (例: `7`) または `YYYYMMDD` 形式の特定日付を
渡す。引数が無い場合は直近7日分のログを対象とする

設定に起因すると考えられる原因の優先順位付きレポートと、具体的なsettings.json修正案を
人間が読める形式で出力する。いかなるファイルも変更しない。このスキルは提案の出力のみを
行い、修正の適用はユーザーが手動で行う

## 出力ルール

- 表記は本リポジトリのCLAUDE.md「表記・出力ルール」節に従う (半角括弧、理由の前置き、水平線不使用、体言止め、文末の「。」不使用)
