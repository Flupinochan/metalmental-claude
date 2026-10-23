# Claude Code Plugin

## 概要

metalmental (ユーザ名) の `claude code` の `plugins` 等をまとめたリポジトリ

## plugin一覧

| plugin名                  | 説明                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| ask-user-question-enforce | skill内のユーザー確認手順をAskUserQuestion Toolに統一する記法ルールを提供       |
| aws-best-practice         | AWSリソースを作成する時の推奨設定を提供                                         |
| career-transition-support | ITエンジニア転職支援Skill、職務経歴書の作成/添削を行う                          |
| code-review-by-book       | 読んだ技術書をもとにしたコードレビューWorkflow                                  |
| git-github                | commit、worktree/branch、pr作成Skill                                            |
| local-doc-search          | ローカルPCのファイルを全文検索やRAG検索するMCP                                  |
| sandbox-enforce           | 全claude設定ファイルでsandbox.enabledにするSkill                                |
| session-daily-report      | 全プロジェクトのセッション履歴から日報を出力するWorkflow                        |
| statusline                | 入力欄の上にディレクトリ名、モデル名、使用率、review等のボタンを常時表示するmod |
| tool-failure-log          | PostToolUseFailureを記録し、Toolの実行エラーを調査可能にするSkill               |
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
