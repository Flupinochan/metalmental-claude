---
name: commit-enforce
description: このスキルは、ユーザーが「コミットして」「commitして」のように、git commitを実行したい場合に使用する
compatibility: Requires git
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: Bash(git diff *) Bash(git add *) Bash(git ls-files *) Bash(git ls-files * | wc -l) Bash(git branch *) Bash(CLAUDE_COMMIT_ALLOWED=1 git commit *) Read
---

# シンプルコミットワークフロー

## 重要 - Bash tool call のルール

- 1コマンドにつき1つのtool callで実行すること
- `&&` や `;` によるチェーン実行は禁止

SKILLのFront Matterにおいて `allowed-tools` で実行を許可するコマンドを定義していますが、チェーン実行すると許可パターンにマッチせず、ユーザーに不要な確認が発生するためです

```bash
# NG: 複数のコマンドを1つのtool callで実行
git add file1.txt file2.txt && CLAUDE_COMMIT_ALLOWED=1 git commit -m "fix: something"
git status; git diff HEAD
```

```bash
# OK: 1コマンドごとに1つのtool callで実行
git add file1.txt file2.txt # 1回目のtool call
CLAUDE_COMMIT_ALLOWED=1 git commit -m "fix: something" # 2回目のtool call
```

## 手順

### Step1: コミット対象のファイルを取得

[get-commit-target-files.md](../get-commit-target-files.md) を参照し、コミット対象のファイル情報と変更元 (`staged` または `workspace`) を取得

- `staged` の場合: Step3へ進む
- `workspace` の場合: Step2へ進む

### Step2: コミット対象をグループ分け

1. 必要に応じてworking treeの変更を論理的なグループ (機能追加、バグ修正、ドキュメント変更など) に分割する
2. グループ分けを `AskUserQuestion` ツールを使用してユーザーに確認を求める:

> 「以下のグループでNコミットに分割しますか？」
> グループ1: `<files>`
> グループ2: `<files>`
> ...

オプション:

- **承認:** 提案したグループごとにコミットする
- **単一コミット:** 全ファイルを1つでコミットする
- **手動で指定:** ユーザーがグループ分けを指定する

### Step3: コミットメッセージを生成

以下のルールに従いコミットメッセージを生成する

**形式:** `<type>: <説明>`

1. 現在のブランチ名を取得

```bash
git branch --show-current
```

2. ブランチ名が `<prefix>/<suffix>` の形式の場合、prefixを以下の対応表でtypeに変換する

| ブランチprefix | type   |
| -------------- | ------ |
| `feature`      | `feat` |
| `bug`          | `fix`  |

対応表に一致するprefixが取得できた場合はそのtypeを使用し、3のtype一覧は参照しない

対応表に一致しない場合、またはブランチ名がこの形式でない場合は、変更内容に基づき3のtype一覧からtypeを判断する

3. **typeの一覧 (対応表に一致しない場合のみ使用):**

| Type       | 用途                                   |
| ---------- | -------------------------------------- |
| `feat`     | 新機能                                 |
| `fix`      | バグ修正                               |
| `docs`     | ドキュメントのみの変更                 |
| `style`    | 動作に影響しないフォーマット変更       |
| `refactor` | バグ修正や機能追加を伴わないコード整理 |
| `test`     | テストの追加・修正                     |
| `chore`    | ビルド・依存関係・ツール関連の変更     |
| `ci`       | CI/CD設定の変更                        |
| `perf`     | パフォーマンス改善                     |

4. Step1で取得したファイルの変更内容を元に適切な `<説明>` を生成

5. `<type>: <説明>` の形式でコミットメッセージを生成

生成したメッセージを `AskUserQuestion` ツールを使用してユーザーに確認を求める:

> 「このコミットメッセージでよろしいですか？」
> `<生成されたメッセージ>`

オプション:

- **承認:** 生成されたコミットメッセージをそのまま使用する
- **手動で指定:** ユーザーが指定したコミットメッセージを使用する

### Step4: コミットを実行

`git commit` には必ず `CLAUDE_COMMIT_ALLOWED=1` をつける

- `staged` の場合:
  ```bash
  CLAUDE_COMMIT_ALLOWED=1 git commit -m "<承認されたメッセージ>"
  ```
- `workspace` の場合:
  ```bash
  git add <このグループのファイル>
  CLAUDE_COMMIT_ALLOWED=1 git commit -m "<承認されたメッセージ>"
  ```

残りの各グループがある場合は、Step3とStep4を繰り返す
