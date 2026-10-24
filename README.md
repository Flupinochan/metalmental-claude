# Claude Code Plugin

## 概要

metalmental (ユーザ名) の `claude code` の `plugins` 等をまとめたリポジトリ

## plugin一覧

| plugin名                  | 説明                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| ask-user-question-enforce | Skillのユーザー確認をAskUserQuestionに統一させるSKILL                           |
| aws-best-practice         | AWSリソースの推奨設定SKILL                                                      |
| career-transition-support | ITエンジニア転職SKILL                                                           |
| code-review-by-book       | 読んだ技術書をもとにしたコードレビューWorkflow                                  |
| git-github                | commit、worktree/branch、pr作成Skill                                            |
| local-doc-search          | ローカルPCのファイルを全文検索やRAG検索するMCP                                  |
| sandbox-enforce           | 全claude設定ファイルでsandbox.enabledにするSkill                                |
| session-daily-report      | 全プロジェクトのセッション履歴から日報を作成するWorkflow                        |
| statusline                | ModelやBranch名、Python等のversionを表示するstatusline Mod                      |
| tool-failure-log          | Toolの実行エラーを調査可能にするSkill                                           |
| ui-plus                   | UIに表のコピーや会話の折りたたみボタン追加するMod                               |
| verified-web-search       | 検索したURLの完全なページを取得し、正確な1件のみ返すWorkflow                    |

## Add Marketplace

```bash
# Launch Claude
claude

# Add this marketplace
/plugin marketplace add https://github.com/Flupinochan/metalmental-claude

# Reload plugins
/reload-plugins
```

## Install Plugins Example

```bash
/plugin install git-github@metalmental-plugins-official
/git-github:commit-enforce
```

## Local Develop Example

```bash
claude --plugin-dir "$(pwd)/plugins/session-daily-report"
```

## 共通ルール (plugin作成/修正後にすること)

- `plugin.json` の `version` を上げること
- `plugin-dev:plugin-validator` や `claude plugin validate, test, eval` 実行して動作確認するかユーザに確認すること
- [docs/help-skill-sample.md](docs/help-skill-sample.md) を参考にして `/help` skillを作成すること
