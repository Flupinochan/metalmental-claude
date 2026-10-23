---
name: code-review
description: このスキルは、技術書をもとにしたレビュー観点をもとにコードレビューしたい場合に使用する
disable-model-invocation: true
allowed-tools: AskUserQuestion Glob Workflow Bash(gh pr list *)
---

# 書籍ベースのコードレビュー

## 手順

### Step1: レビュー観点ファイルの収集

`Glob`ツールを `pattern: "${CLAUDE_PLUGIN_ROOT}/skills/code-review/references/**/*.md"` で呼び出し、レビュー観点ファイルの絶対パス一覧を取得

0件の場合は、`レビュー観点ファイルがありません。このskillのStep1に記載されているパスを修正してください` を伝えて処理を終了

### Step2: レビュー対象を決定

#### `$ARGUMENTS` が空でない場合

`$ARGUMENTS` をそのまま `target` として扱い、`mode` を `free` としてStep3へ進む

#### `$ARGUMENTS` が空の場合

以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認

```yaml
questions:
  - question: レビュー対象を選んでください
    header: レビュー対象
    multiSelect: false
    options:
      - label: ローカルの変更
        description: staged (git diff --cached) があればそれを、なければworking treeの変更 (追跡済み差分と未追跡ファイル) をレビュー対象にする
      - label: Pull Request
        description: GitHub上のPull Requestをレビュー対象にする
```

- `ローカルの変更` の場合: `mode` を `local` としてStep3へ進む
- `Pull Request` の場合: 以下の手順に従う

1. `gh pr list --limit 4 --json number,title` を実行
2. 結果が0件の場合、`Pull Requestが見つかりませんでした` と伝えて処理を終了
3. 結果が1件の場合、そのPRの番号を`target`、`mode`を`pr`としてStep3へ進む
4. 結果が2件以上の場合、取得した各PRを`#<number> <title>`の形式で選択肢にし、以下をもとに`AskUserQuestion`ツールを実行
   ```yaml
   questions:
     - question: レビュー対象のPull Requestを選んでください
       header: Pull Request
       multiSelect: false
       options:
         - label: "#<number> <title>"
           description: ""
   ```

選択肢から回答を得た場合は、回答から得たPR番号を`target`、`mode`を`pr`とする

### Step3: reviewer subagentのmodelを決定

以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認

```yaml
questions:
  - question: reviewerで使用するmodelを選んでください
    header: model
    multiSelect: false
    options:
      - label: haiku
        description: 高速・低コストのモデル
      - label: sonnet
        description: 速度と精度のバランスが取れたモデル
      - label: opus
        description: 最も高精度なモデル、コストと時間はかかる
```

回答から得たmodelをStep4へ渡す

### Step4: Workflowを実行しレビューを実施

以下の引数をもとに`Workflow`ツールで`code-review-by-book:code-review-by-book-workflow`という名前のworkflowを実行

`args: { "mode": "<mode>", "target": "<targetがあれば渡す、なければキー自体を省略>", "reviewViewpointFiles": ["<Step1で取得した絶対パス>", ...], "model": "<Step3で選択したmodel>" }`

### Step5: レビュー結果を表示

- 結果に`error`がある場合、その内容を表示
- `failedReviewers` が1件以上ある場合、失敗したレビュー観点ファイル名を表示
- レビュー結果が0件で `failedReviewers` も0件の場合、`レビューの結果、指摘はありませんでした` と表示
- レビュー結果が1件以上ある場合、以下の表形式にして表示
  - `findings`の1要素につき、`items`の1要素を1行とする
    - 1つの`findings`の2行目以降は、`場所`を空欄にする
  - `line`がない場合は`<file>`のみを表示

| 場所            | 観点ファイル / 観点               | 指摘       |
| --------------- | --------------------------------- | ---------- |
| `<file>:<line>` | `<source>` / `<viewpointHeading>` | `<reason>` |
|                 | `<source>` / `<viewpointHeading>` | `<reason>` |
| `<file>:<line>` | `<source>` / `<viewpointHeading>` | `<reason>` |
