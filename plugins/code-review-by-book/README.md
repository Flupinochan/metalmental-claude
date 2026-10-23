# code-review-by-book

## 概要

- 読んだ技術書ごとにレビュー観点を `references/**/*.md` ファイルとして蓄積
- レビュー観点ファイル1件につき1つのsubagentで並行してレビューを実施

## 前提環境

- `git`
- `gh` (Pull Requestをレビューする場合のみ)

## 提供するskill

| skill         | 説明           |
| ------------- | -------------- |
| `code-review` | レビューを実行 |

`/code-review-by-book:code-review [レビュー対象]` で明示的に呼び出す

### レビュー対象の指定方法

| 指定                                                     | 動作                                     |
| -------------------------------------------------------- | ---------------------------------------- |
| 引数なし                                                 | `AskUserQuestion`で対話形式で指定        |
| 引数あり (ファイル名、ファイルパス)                      | `free` modeとして、そのファイルをレビュー対象にする |

### workflowの引数

| 項目                   | 型       | 必須     | 説明                                                        |
| ---------------------- | -------- | -------- | ----------------------------------------------------------- |
| `mode`                 | string   | 必須     | `local` / `pr` / `free` のいずれか                          |
| `target`               | string   | mode次第 | `pr`はPR番号、`free`はファイル名またはファイルパス         |
| `reviewViewpointFiles` | string[] | 必須     | `references/**/*.md` の絶対パス一覧                         |
| `model`                | string   | 必須     | reviewerに使うmodel、`haiku` / `sonnet` / `opus` のいずれか |

## 処理フロー

```mermaid
flowchart TD
    A(["/code-review-by-book:code-review [target]"]) --> B["SKILL.md: referencesを収集"]
    B --> C{"$ARGUMENTS は空か"}
    C -- 空でない --> D["mode=free"]
    C -- 空 --> E["AskUserQuestion: ローカル / Pull Request"]
    E -- ローカル --> F["mode=local"]
    E -- Pull Request --> G["gh pr listから選択 / mode=pr"]
    D --> K["AskUserQuestion: haiku / sonnet / opus"]
    F --> K
    G --> K
    K --> H["Workflow: code-review-by-book-workflow"]
    H --> I["Scope: レビュー対象を出力するコマンドを確定"]
    I -- error --> N(["SKILL.md: errorを表示して終了"])
    I --> J["Review: レビュー観点ファイルごとにreviewerを並行実行"]
    J --> M([指摘を表示])
```

### scope-collector agentの処理フロー

`agents/scope-collector.md` の処理を表す

```mermaid
flowchart TD
    A(["入力: mode, target"]) --> B{"mode"}

    subgraph S1["Step1: レビュー対象を出力するコマンドを確定"]
        B -- local --> C{"ステージ済みの変更は1件以上か"}
        C -- 1件以上 --> D["git diff --cached"]
        C -- 0件 --> E["git diff と未追跡の通常ファイルの grep -n '' 出力"]
        B -- pr --> F["gh pr diff target"]
        B -- free --> G["targetからファイルを特定し grep -n '' で出力"]
    end

    D --> H["Step2: コマンドを実行"]
    E --> H
    F --> H
    G --> H
    H --> I{"出力があったか"}
    I -- あり --> M["Step3: reviewTargetCommandを返す"]

    I -- なし --> Z(["レビュー対象が見つかりませんでした というerrorのみを返して終了"])
    C -- コマンドエラー --> Z
    H -- コマンドエラー --> Z
```

## ファイル構成

| ファイル                                | 役割                                            |
| --------------------------------------- | ----------------------------------------------- |
| `skills/code-review/SKILL.md`           | `workflows/code-review.js` を実行               |
| `skills/code-review/references/**/*.md` | レビュー観点ファイル                            |
| `workflows/code-review.js`              | Scope → Review の順でagentを実行                |
| `agents/scope-collector.md`             | レビュー対象を出力するコマンドを確定するagent   |
| `agents/reviewer.md`                    | レビュー観点ファイルごとに並行レビューするagent |
