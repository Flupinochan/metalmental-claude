---
name: commit-enforce
description: このスキルは、ユーザーが「コミットして」「commitして」のように、git commitを実行したい場合に使用する
compatibility: Requires git
license: MIT
metadata:
  author: MetalMental
  version: "1.1"
allowed-tools: AskUserQuestion Bash(git diff *) Bash(git add *) Bash(git ls-files *) Bash(git ls-files * | wc -l) Bash(git branch *) Bash(CLAUDE_COMMIT_ALLOWED=1 git commit *) Read
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

同様の理由で、複数行のコミットメッセージもヒアドキュメントやコマンド置換 `$()` は使用せず、Step5に記載の複数 `-m` オプションで組み立てること

## 手順

### Step1: コミット対象のファイルを取得

[get-commit-target-files.md](references/get-commit-target-files.md) を参照し、コミット対象のファイル情報と変更元 (`staged` または `workspace`) を取得

- `staged` の場合: Step3へ進む
- `workspace` の場合: Step2へ進む

### Step2: コミット対象をグループ分け

1. 必要に応じてworking treeの変更を論理的なグループ (機能追加、バグ修正、ドキュメント変更など) に分割する
2. 以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

   ```
   questions:
     - question: 提案したグループでNコミットに分割しますか (グループ1 <files>、グループ2 <files> …)
       header: グループ分け
       multiSelect: false
       options:
         - label: 承認
           description: 提案したグループごとにコミットする
         - label: 単一コミット
           description: 全ファイルを1つでコミットする
         - label: 手動で指定
           description: ユーザーがグループ分けを指定する
   ```

### Step3: ブランチ情報を取得

このStepはブランチ単位の情報を扱うため、グループ数に関わらず1回のみ実行する

1. 現在のブランチ名を取得

```bash
git branch --show-current
```

ブランチ名が取得できない場合 (detached HEADなど) は、typeの候補とissue番号のいずれも取得せずStep4へ進む

2. ブランチ名が `<prefix>/<suffix>` の形式の場合、prefixを以下の対応表でtypeに変換し、typeの候補として記録する

| ブランチprefix | type   |
| -------------- | ------ |
| `feature`      | `feat` |
| `bug`          | `fix`  |

対応表に一致するprefixが取得できた場合はそのtypeを候補として使用し、Step4のtype一覧は参照しない

対応表に一致しない場合、またはブランチ名がこの形式でない場合は、typeの候補は記録せず、Step4のtype一覧から変更内容に基づき判断する

3. ブランチ名からissue番号を抽出

抽出ルール: branch名の最後のセグメントが数値のみの場合、それをissue番号とする

- 例1: `feature/123` → `123`
- 例2: `bug/456` → `456`
- 例3: `feature/fix-username-validation` → 数値のみのセグメントがないため抽出なし

issue番号のないbranchも存在するため、取得できなかった場合はスキップしてよい

4. issue番号を取得できた場合のみ、以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

   ```
   questions:
     - question: コミットメッセージにCloses #<issue番号>を付与しますか
       header: Closesフッター
       multiSelect: false
       options:
         - label: 付与する
           description: すべてのグループの中で最後にコミットするグループのメッセージにCloses #<issue番号>フッターを付与する
         - label: 付与しない
           description: フッターを付与しない
   ```

この回答はブランチ単位で1回のみ確認し、以降のグループでも同じ回答を再利用する

### Step4: コミットメッセージを生成

グループごとに以下の1〜5を実施する

**形式:**

```
<type>[!]: <説明>

[BREAKING CHANGE: <破壊的変更の内容>]

[Closes #<issue番号>]
```

`[]` は条件を満たす場合のみ付与する要素

1. **typeを決定**

Step3でtypeの候補を取得できた場合はそれを使用する。取得できなかった場合は、変更内容に基づき以下の一覧から判断する

| Type       | 用途                                   |
| ---------- | -------------------------------------- |
| `feat`     | 新機能                                 |
| `fix`      | バグ修正                               |
| `docs`     | ドキュメントのみの変更                 |
| `style`    | 動作に影響しないフォーマット変更       |
| `refactor` | バグ修正や機能追加を伴わないコード整理 |
| `test`     | テストの追加・修正                     |
| `chore`    | 他のtypeに当てはまらない雑務的な変更   |
| `ci`       | CI/CD設定の変更                        |
| `perf`     | パフォーマンス改善                     |
| `build`    | ビルドシステム・依存関係の変更         |
| `revert`   | 過去のコミットの取り消し               |

2. **説明を生成**

Step1で取得したファイルの変更内容を元に `<説明>` を生成する

- 50文字以内に収める
- 体言止め、または「~を追加」「~を修正」の形式で書く
- 1コミット1論理変更とし、複数の変更を1文に詰め込まない
- 文末に `。` を付けない

3. **破壊的変更を判定**

このグループの変更内容に以下が含まれるか確認する

- 公開関数・メソッド・クラスの削除またはリネーム
- 引数の削除・順序変更・必須化
- 戻り値やレスポンス形式の変更
- APIのエンドポイントパスやHTTPメソッドの変更
- 設定キー・環境変数の削除・リネーム・必須化
- CLIオプションの削除・リネーム
- DBスキーマの破壊的変更 (カラム削除、NOT NULL化など)

該当する場合のみ、以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

   ```
   questions:
     - question: この変更は破壊的変更ですか (<検出した破壊的変更の内容>)
       header: 破壊的変更
       multiSelect: false
       options:
         - label: 破壊的変更として扱う
           description: "typeの直後 (:の直前) に!を付与し、BREAKING CHANGE:フッターを追加する"
         - label: 通常の変更として扱う
           description: "!とフッターを付与しない"
   ```

該当しない場合は確認せず4へ進む

4. **フッターを組み立てる**

- 3で破壊的変更として扱う場合: `BREAKING CHANGE: <破壊的変更の内容>` を追加
- Step3で `Closes #<issue番号>` の付与が承認されており、かつこのグループが最後にコミットするグループの場合: `Closes #<issue番号>` を追加

5. **メッセージを確認**

生成したメッセージについて、以下をもとに`AskUserQuestion`ツールを呼び出してユーザに確認する

   ```
   questions:
     - question: このコミットメッセージでよろしいですか (<生成されたメッセージ>)
       header: メッセージ確認
       multiSelect: false
       options:
         - label: 承認
           description: 生成されたコミットメッセージをそのまま使用する
         - label: 手動で指定
           description: ユーザーが指定したコミットメッセージを1行のまま使用する
   ```

   「手動で指定」の場合、`!` とフッターは付与しない

生成例:

```
feat!: 認証エンドポイントを変更

BREAKING CHANGE: /auth/login のレスポンス形式を変更

Closes #123
```

### Step5: コミットを実行

`git commit` には必ず `CLAUDE_COMMIT_ALLOWED=1` をつける

フッターがある場合は `-m` を複数指定する。`-m` ごとに空行が挿入されるため、ヒアドキュメントやコマンド置換 `$()` は使用しない

- `staged` の場合:

  ```bash
  # フッターなし
  CLAUDE_COMMIT_ALLOWED=1 git commit -m "<件名>"

  # フッターあり
  CLAUDE_COMMIT_ALLOWED=1 git commit -m "<件名>" -m "BREAKING CHANGE: <破壊的変更の内容>" -m "Closes #<issue番号>"
  ```

- `workspace` の場合:

  ```bash
  git add <このグループのファイル>
  CLAUDE_COMMIT_ALLOWED=1 git commit -m "<件名>" -m "BREAKING CHANGE: <破壊的変更の内容>"
  ```

残りの各グループがある場合は、Step4とStep5を繰り返す。Step3は再実行しない
