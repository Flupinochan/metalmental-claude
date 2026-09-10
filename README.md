# Claude Code Plugin

## 概要

metalmental (ユーザ名) の `claude code` の `plugins` 等をまとめたリポジトリ

## plugin一覧

| plugin名                  | 説明                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ask-user-question-enforce | skill内のユーザー確認をAskUserQuestionツールに統一する記法ルールを提供                                                 |
| career-transition-support | 日本のITエンジニア転職支援skill、職務経歴書の作成/添削、求人票のマッチ度分析、ポートフォリオのケーススタディ作成を行う |
| git-github-workflow       | git commit実行、worktree/branch作成、GitHub pull request作成をまとめたworkflow                                         |
| local-doc-search          | ローカルPCのドキュメントを全文検索とRAG検索で横断検索するMCPプラグイン                                                 |
| sandbox-enforce           | 全設定ファイルのsandbox.enabledをスキャンし、確認の上でuser設定へ統一する                                              |
| session-daily-report      | 全プロジェクトのセッション履歴から日本語の日報タイムラインを出力するworkflow                                           |
| tool-failure-log          | PostToolUseFailureイベントを自動記録し、ログクリアや設定修正調査のskillを提供                                          |
| verified-web-search       | URLの完全なdocumentを取得し敵対的検証を経た1件のみ返すworkflow                                                         |

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
/plugin install git-github-workflow@metalmental-plugins-official
/git-github-workflow:commit-enforce
/git-github-workflow:create-worktree-and-branch
/git-github-workflow:create-pull-request
```

## Local Develop Example

```bash
claude --plugin-dir ./plugins/session-daily-report
```

## plugin作成/修正後にすること

plugin を修正した後に必ず `plugin-dev:plugin-validator` 実行して動作確認するかユーザに確認すること
