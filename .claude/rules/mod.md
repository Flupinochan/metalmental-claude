---
paths:
  - "plugins/*/hooks/**/*.{ts,tsx}"
  - "plugins/*/.claude-plugin/types/**"
  - "types/**"
---

# mod の制約

- `$` や `$.ui` などの名前空間は、変数に代入、分割代入、計算したキーでの参照をしないこと
- `read($, atom)` の atom は、同じファイルで定義すること
- `on()` のイベント名は、文字列リテラルにすること
- `$.state.set` は `undefined` を保存できないため、`{ percent?: number }` のように包むこと
- JSDoc は日本語で書くこと

# mod の実装ルール

- バックグラウンドの読み取りでロックを取らないため、`git` の実行には、先頭に `--no-optional-locks -C <作業ディレクトリ>` を必ず付けること
- ログ出力は `$.ui.log` を利用すること
  - `claude --debug-file /tmp/mod-debug.log --plugin-dir "$(pwd)/plugins/<plugin名>"` のように起動するとログを確認しながら動作確認が可能
- UIの配色は `colors.ts` を利用すること
- atom の変数名は `xxxState`、保存済みの値を読む関数は `readXxx`、外部の情報を取得して保存済みの値を更新する関数は `syncXxx` と命名すること
- エンジンの更新時は、各 mod の `.claude-plugin/types/` の `claude-code/index.d.ts` と `claude-code-tools/index.d.ts` を、ルートの `types/` の同名のディレクトリに再コピーすること
