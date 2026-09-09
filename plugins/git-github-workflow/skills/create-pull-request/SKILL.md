---
name: create-pull-request
description: このスキルは、ユーザーが「PRを作成して」「pull requestを作って」のように、現在のbranchの変更をpull requestとして提出したい場合に使用する
compatibility: Requires git, gh
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: AskUserQuestion Bash(git branch *) Bash(git fetch *) Bash(git log *) Bash(git diff *) Bash(git remote *) Bash(gh pr create *)
---

# create-pull-request

## 重要

### Bash tool callのルール

- 1コマンドにつき1つのtool callで実行する
- `&&`や`;`によるチェーン実行は禁止

### エラー発生時は即時停止する

コマンド実行時にエラーが発生した場合

1. 後続のステップを実行しない
2. 別のコマンドやオプション、引数で実行するなどの回避策を行わない
3. エラー内容をユーザに報告して停止する
4. エラーから原因がわかる場合はユーザに対応方法を伝える

ユーザの意図しない誤った内容で書き込みをする操作は避ける

## 手順

### Step 1: GitHub issue番号を取得

1. 現在のbranch名を取得

```bash
git branch --show-current
```

2. branch名からissue番号を抽出

抽出ルール: branch名の最後のセグメントが数値のみの場合、それをissue番号とする

- 例1: `feature/123` → `123`
- 例2: `bug/456` → `456`
- 例3: `feature/fix-username-validation` → 数値のみのセグメントがないため抽出なし

issue番号のないbranchも存在するため、取得できなかった場合はスキップしてよい。Step 2へ進む

### Step 2: Pull Requestのマージ先を確認

`AskUserQuestion`ツールを使用してユーザにマージ先branch名の確認をする

**question**: マージ先のbranch名を選択してください

**options**:

- label: main (デフォルト)
  - description: mainブランチにマージする
- label: develop
  - description: developブランチにマージする

Step 3へ進む

### Step 3: Pull Requestの内容を生成

1. 変更差分を取得

```bash
# マージ先branchを最新化
git fetch origin <Step 2のマージ先branch>

# 変更差分を取得
git log origin/<Step 2のマージ先branch>..HEAD --oneline
git diff origin/<Step 2のマージ先branch>...HEAD
```

2. 取得した変更差分をもとに以下のPull Requestの内容を自動生成

```markdown
## 変更内容

変更差分をもとに変更概要を箇条書きで自動生成

## 動作確認

- [ ] 動作確認すべき内容をここに追記

## 補足

任意のセクション。なければ省略
```

生成したPull Requestの内容をユーザに表示し、Step 4に進む

### Step 4: Pull Requestのタイトルを生成

`AskUserQuestion`ツールを使用してユーザに確認を求める

<変更概要>にはStep 3で取得した変更差分をもとに自動生成して挿入する

**question**: Pull Requestタイトルの形式を選択してください

**options**:

- label: `【#<issue番号>】<変更概要>`
  - description: GitHub issue番号付きのタイトル。Step 1でissue番号を取得できなかった場合はこの選択肢を提示しない
- label: `<変更概要>`
  - description: issue番号なしのタイトル

Step 5へ進む

### Step 5: Pull Requestを作成

以下を実行してPull Requestを作成

```bash
gh pr create --title "<Step 4のPull Requestタイトル>" --base <Step 2のマージ先branch> --body "<Step 3のPull Request内容>"
```

Pull Request作成後、生成されたPull RequestのタイトルおよびURLをユーザに表示

Step 6へ進む

### Step 6: /code-reviewを実施

`code-review`を利用してコードレビューを実施するようユーザに伝える

実行は不要
