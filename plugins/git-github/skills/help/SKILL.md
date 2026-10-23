---
name: help
description: このpluginが提供するskill, commandの一覧を表示する
disable-model-invocation: true
---

# 利用可能なskill, commandの一覧表

`grep -H '^description:' ${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md ${CLAUDE_PLUGIN_ROOT}/commands/*.md 2>/dev/null || true` を実行し、結果の各行を `コマンド` と `説明` の列を持つ以下の形式の表で出力すること

| コマンド  | 説明                |
| --------- | ------------------- |
| `/<名前>` | <descriptionの要約> |
