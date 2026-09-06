---
description: 指定日 (省略時は今日) の全プロジェクトのセッション履歴から日本語の日報タイムラインを生成し、ターミナルに表示する
argument-hint: [YYYY-MM-DD]
allowed-tools: Workflow, Bash(printenv DAILY_REPORT_CONCURRENCY), Bash(printenv DAILY_REPORT_MIN_FILE_SIZE)
---

## 引数

- `$1` — 対象日 (任意、`YYYY-MM-DD`形式、JST基準)

## コンテキスト

- 並列数の環境変数 (未設定なら空文字): !`printenv DAILY_REPORT_CONCURRENCY || true`
- 除外する最小ファイルサイズ(バイト)の環境変数 (未設定なら空文字): !`printenv DAILY_REPORT_MIN_FILE_SIZE || true`

## 手順

1. `$1` が指定されている場合、`YYYY-MM-DD` 形式であることを確認する
   - 形式が不正な場合はエラーを表示し、処理を中断する
2. `$1` が省略されている場合、環境コンテキストの今日の日付 (JST) を対象日として使う
3. `Workflow` ツールで `daily-report-plugin:daily-report-workflow` という名前のworkflowを呼び出す
   - この名前で解決しない場合は、bareの `daily-report-workflow` で再試行する
   - `args: { "date": "<対象日 YYYY-MM-DD>", "concurrency": <並列数env変数を数値変換できた場合のみその値、できなければキー自体を省略>, "minFileSize": <最小ファイルサイズenv変数を数値変換できた場合のみその値、できなければキー自体を省略> }` を渡す
4. workflowから返却された `entries` (`[{startTime, endTime, summary}]`) を、以下の形式でそのままターミナルに表示する

```
HH:MM~HH:MM <summary>
HH:MM~HH:MM <summary>
```

- `entries` が空の場合、「<対象日>のセッション履歴が見つからなかった」旨を1行で表示する
- 表示する文章はMarkdownの見出しや装飾で囲まず、上記のプレーンなタイムライン形式のみを出力する
- 文体・表記は本リポジトリのCLAUDE.md「表記・出力ルール」節に従う (半角括弧、理由の前置き、水平線不使用、体言止め、文末の「。」不使用)
