# statusline

## コマンド

ファイルを修正した後、以下を実行すること

- `npm run format`
- `npm run typecheck`
- `claude plugin test plugins/statusline`
- `claude plugin validate plugins/statusline`

## 実装ルール

- バックグラウンドの読み取りでロックを取らないため、`git` の実行には、先頭に `--no-optional-locks -C <作業ディレクトリ>` を必ず付けること
- ログ出力は `$.ui.log` を利用すること
  - `claude --debug-file /tmp/statusline-debug.log --plugin-dir "$(pwd)/plugins/statusline"` のように起動するとログを確認しながら動作確認が可能
- UIの配色は `colors.ts` を利用すること
- すべての関数に、日本語の JSDoc (`@param`、`@returns`) を付けること

## mod の制約

- `$` や `$.ui` などの名前空間は、変数に代入、分割代入、計算したキーでの参照をしないこと
- `read($, atom)` の atom は、同じファイルで定義すること
- `on()` のイベント名は、文字列リテラルにすること
- `$.state.set` は `undefined` を保存できないため、`{ percent?: number }` のように包むこと

## 型

- エンジンの更新時は、`.claude-plugin/types/` の `claude-code/index.d.ts` と `claude-code-tools/index.d.ts` を、ルートの `types/` の同名のディレクトリに再コピーすること
