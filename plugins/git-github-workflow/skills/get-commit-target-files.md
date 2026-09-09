# コミット対象ファイルの取得

以下のStepに従い、コミット対象のファイル情報を取得する

## Step1: indexにある変更内容を取得

```bash
# 1. ファイルパスの一覧を取得
git diff --cached --name-only
# 2. ファイルの変更内容を取得
git diff --cached
```

1. 出力がある場合: 変更元を `staged` として記録し、Step3へ進む
2. 出力がない場合: Step2へ進む

## Step2: working treeにある変更内容を取得

### 追跡済みファイルの変更内容を取得

```bash
# 追跡済みファイルパスの一覧を取得
git diff --name-only
# 追跡済みファイルの変更内容を取得
git diff
```

### 未追跡ファイルの変更内容を取得

```bash
# 未追跡ファイルパスの一覧を取得
git ls-files --others --exclude-standard
# 未追跡ファイルの件数を取得
git ls-files --others --exclude-standard | wc -l
```

未追跡ファイルの件数を確認

1. 20件を超える場合は、以下のメッセージをユーザーに伝えて処理を終了

   「未追跡ファイルが N 件あります。誤って大量のファイルをコミットするリスクを避けるため、処理を中断しました」

2. 20件以下の場合は、各未追跡ファイルの変更内容を取得

```bash
# 各未追跡ファイルの変更内容を取得 (差分ありの場合はexit code 1でエラー判定になるため || true で抑制すること)
git diff --no-index /dev/null <file> || true
```

変更元を `workspace` として記録し、Step3へ進む

## Step3: 以下の情報を整理し、後続の処理に利用

- 変更元の判定 (`staged` または `workspace`)
- 変更対象のファイルパス一覧
- 各ファイルの変更内容
