---
name: create-worktree-and-branch
description: このスキルは、ユーザーが「worktreeを作成して」「branchを切って」のように、既存のbranchを汚さずにコード修正を始めたい場合に使用する
compatibility: Requires git
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: AskUserQuestion EnterWorktree Read Edit Write Bash(git rev-parse *) Bash(git fetch origin *) Bash(git worktree *) Bash(git branch *)
---

# worktree・branch作成

## 出力ルール

- コマンドが失敗した場合、回避策を試さず失敗内容をそのまま報告する
- ユーザーが選択・入力した値 (ベースブランチ名、prefix、suffix) を大文字小文字や記号も含めて改変しない

## 手順

### ステップ1: 前提確認

`git rev-parse --is-inside-work-tree`でリポジトリルートパスを取得する

- `false`でgit管理下でない場合は、その旨を伝えてここで終了する
- 以降に登場するパスは、すべてこのルートパスからの相対で組み立てる

### ステップ2: ベースブランチ名の確認

`AskUserQuestion`で確認する

- question: ベースブランチ名を教えてください
- options:
  - label: develop
    - description: 開発時
  - label: staging
    - description: バグ修正時

### ステップ3: 作業ブランチ名のプレフィックスを確認

`AskUserQuestion`で確認する

- question: 作業ブランチ名のprefixを教えてください
- options:
  - label: feature
    - description: 機能追加時
  - label: bug
    - description: バグ修正時

### ステップ4: 作業ブランチ名のサフィックスを確認

`AskUserQuestion`で確認する

- question: 作業ブランチ名のsuffixを教えてください
- options:
  - label: 1
    - description: GitHub Issue等の数値指定
  - label: fix-username-validation
    - description: 修正内容の概要で指定

### ステップ5: 重複確認

以下を確認し、いずれか既存の場合はその旨を伝えてここで終了する。ユーザーに断りなく別名を組み立てない

- `git rev-parse --verify --quiet refs/heads/<prefixのサフィックス>/<サフィックス>`でbranchの重複を確認する
- `git worktree list`で`.claude/worktrees/<サフィックス>`の重複を確認する

### ステップ6: `.gitignore`の確認と追記

リポジトリルート直下の`.gitignore`に`.claude/worktrees/`が含まれるか確認する

- 含まれていれば何もしない
- 含まれていなければ追記する。`.gitignore`自体が存在しなければ新規作成する
- worktreeへ移動した後はメインチェックアウトへの書き込みができなくなるため、このステップは必ずステップ8より前に実施する

### ステップ7: worktreeおよびbranchを作成

```bash
git fetch origin <ベースブランチ名>
git worktree add --no-track -b <作業ブランチのプレフィックス>/<作業ブランチのサフィックス> .claude/worktrees/<作業ブランチのサフィックス> origin/<ベースブランチ名>
```

`--no-track`は必須とする。開始点がリモート追跡ブランチの場合、`branch.autoSetupMerge`の既定動作により新規branchが自動的にそれを追跡し、本番ブランチへの誤pushにつながるため

### ステップ8: worktreeへ移動

`EnterWorktree`に`path: <リポジトリルート>/.claude/worktrees/<作業ブランチのサフィックス>`を渡し、セッションをそのworktreeへ切り替える

### ステップ9: 結果を報告

`git worktree list`の結果をもとに、作成したworktreeのパスとbranch名、ベースブランチ名を報告する

```markdown
## 作成したworktreeおよびbranch情報

- worktreeパス: xxx
- branch名: xxx
```

### ステップ10: gitignore対象ファイルのコピーコマンドを提示

`.env`等のgitignore対象ファイルは`.worktreeinclude`による自動コピーの対象外であり、新しいworktreeへ引き継がれない

必要な場合に備え、ユーザー自身が手動で実行するためのcpコマンドを例として提示する

実行はしないこと

```bash
cp <リポジトリルート>/.env <リポジトリルート>/.claude/worktrees/<作業ブランチのサフィックス>/.env
```
