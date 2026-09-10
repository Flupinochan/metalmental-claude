---
name: ask-user-question-enforce
description: このスキルは、ユーザーが「SKILLを作成して」「SKILL.mdを修正して」「スキルに確認を追加して」のように、Claude CodeのSKILLを新規作成または編集する場合に使用する。SKILL内でユーザーに確認を求める箇所をAskUserQuestionに統一し、その引数構造の記法を定める
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: AskUserQuestion Read Write Edit Glob Grep
---

# SKILL内でのAskUserQuestion記法の統一

## 原則

- SKILL内でユーザーに確認を求める箇所は、地の文だけで済ませず必ず`AskUserQuestion`ツールを名指して記載する
  - `AskUserQuestion`は回答待ちで通知音が鳴るため、離席時でも確認要求に気づける
  - 曖昧な地の文「確認する」「承認を得る」等をSKILLに記載するだけでは実行時に通知音が鳴らない
- 対象SKILLのfrontmatter`allowed-tools`の先頭に`AskUserQuestion`を追加する
- 連続する複数の確認は、可能な限り1つの`AskUserQuestion`にまとめる

## AskUserQuestionツールの引数構造

```
questions:
  - question: 質問文
    header: チップ表示用の短いラベル (最大12文字)
    multiSelect: false または true
    options:
      - label: 選択肢の表示テキスト
        description: 選択肢の説明
      - label: 選択肢の表示テキスト
        description: 選択肢の説明
```

- `questions`は1~4個まで
- 各questionの`options`は2~4個まで
- 「その他」等の選択肢はツール側が自動追加するため、optionsに定義しない
- 推奨する選択肢がある場合は先頭に置き、labelの末尾に`(推奨)`を付ける

## SKILLへの記述例

作成するSKILLには以下のようなYAML構造で`AskUserQuestion`を記載すること

### 複数の質問を1回にまとめる例

以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

```
questions:
  - question: ベースブランチ名を教えてください
    header: ベースブランチ
    multiSelect: false
    options:
      - label: develop
        description: 開発時
      - label: staging
        description: バグ修正時
  - question: 作業ブランチ名のprefixを教えてください
    header: prefix
    multiSelect: false
    options:
      - label: feature
        description: 機能追加時
      - label: bug
        description: バグ修正時
```

### 質問の回答で複数選択を可能にする例

以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

```
questions:
  - question: レビューで確認したい観点を選んでください
    header: レビュー観点
    multiSelect: true
    options:
      - label: セキュリティ
        description: 認証・入力値検証・機密情報の扱いを確認する
      - label: パフォーマンス
        description: N+1やアルゴリズムの効率を確認する
      - label: 可読性
        description: 命名や関数の長さ、コメントの質を確認する
```
