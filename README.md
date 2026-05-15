# claude-only-commit-workflow

## 概要

Claude Code用のSKILL Plugin

- 手動での `git commit` を禁止し、Claude経由のみに制限
- コードレビューとコミットメッセージを自動化

## 利用可能なスキル

| スキル                  | 説明                                                                  | レビュー |
| ----------------------- | --------------------------------------------------------------------- | -------- |
| `/commit-with-workflow` | 5つのサブエージェントでコードレビューを実施し、問題がなければコミット | あり     |
| `/commit`               | レビューなしで即座にコミット                                          | なし     |

## 処理フロー

### `/commit-with-workflow`

```mermaid
flowchart TD
    A(["/commit-with-workflow"]) --> B["変更ファイルを取得"]
    B --> C{サブエージェントによる並列レビュー}

    C --> R1["review-security"]
    C --> R2["review-performance"]
    C --> R3["review-readability"]
    C --> R4["review-maintainability"]
    C --> R5["review-testing"]

    R1 & R2 & R3 & R4 & R5 --> D{全員 LGTM?}

    D -- "問題あり" --> E([ユーザーに報告して終了。コミットはしない])
    D -- "全員 LGTM" --> F["/commit"]

    F --> G{staged/workspace?}
    G -- staged --> J
    G -- workspace --> H["コミット対象を適切に分割"]
    H --> J["コミットメッセージ生成"]
    J --> K["コミット"]
    K --> L{workspaceに残ファイルがある?}
    L -- あり --> J
    L -- なし --> M([完了])
```

## ファイル構成

| ファイル                               | 役割                                           |
| -------------------------------------- | ---------------------------------------------- |
| `skills/commit-with-workflow/SKILL.md` | `/commit-with-workflow` メインフロー           |
| `skills/commit/SKILL.md`               | `/commit` コミットメッセージ生成・コミット実行 |
| `skills/get-target-files.md`           | 変更ファイル (staged or workspace) 取得用      |
| `agents/review-*.md`                   | レビュー用の各サブエージェント                 |
| `skills/review-output-format.md`       | 各サブエージェントの出力フォーマット           |
| `hooks/hooks.json`                     | Claude以外からの `git commit` を禁止するhooks  |
