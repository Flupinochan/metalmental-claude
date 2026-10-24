# ui-plus 仕様

テストが担保する仕様の一覧

- 各行の ID を、テスト名から参照する
- 「実装」は、仕様を実装している関数や定数の名前。名前がない処理は、ファイル名

## 1. 表のコピーボタン

回答 (`AssistantMessage`) の Markdown の表の上に、表をコピーするボタンを表示する

| ID    | 区分   | 仕様                                                                                                    | 実装                    |
| ----- | ------ | ------------------------------------------------------------------------------------------------------- | ----------------------- |
| UI-1  | 正常系 | 表がない回答は、標準の描画にする                                                                        | `register.tsx`          |
| UI-2  | 正常系 | 表がある回答は、表ごとに表の上へ `COPY TABLE` ボタンを表示する。表以外の文章は、回答の順にそのまま表示 | `register.tsx`          |
| UI-3  | 正常系 | 表以外の文章も、Markdown として表示する                                                                 | `register.tsx`          |
| UI-4  | 正常系 | 要約の回答 (`isSummary`) は、標準の描画にする                                                           | `register.tsx`          |
| UI-5  | 正常系 | ボタンの幅は、端末の横幅から余白 6 (字下げ 2、枠線 2、余裕 2) を引いた幅にそろえる。横幅が分からないときは、文言のみ | `padLabelToWidth`             |
| LBL-1 | 正常系 | 枠線と文言は塗りつぶさない。未押下 → `COPY TABLE` (white、ポインタが乗ると indigo)、成功 → `TABLE COPIED` (green)、失敗 → `COPY FAILED` (red) | `getCopyButtonStyle`    |
| LBL-2 | 正常系 | 文言は中央に置き、両側をノーブレークスペースで埋める                                                    | `padLabelToWidth`             |
| LBL-3 | 正常系 | 横幅が文言より狭くても、文言を切らない                                                                  | `padLabelToWidth`             |
| BTN-1 | 正常系 | ボタンを押すと、表の元の Markdown をそのままコピーする                                                  | `copyTable`             |
| BTN-2 | 正常系 | コピーできたら `TABLE COPIED` を 3 秒間表示して、`COPY TABLE` に戻る                                         | `copyTable`             |
| BTN-3 | 異常系 | コピーが断られたら `COPY FAILED` を 3 秒間表示して、理由をデバッグログに残す                                 | `copyTable`             |
| BTN-4 | 異常系 | コピーが例外で失敗しても `COPY FAILED` を表示して、デバッグログに残す                                        | `copyTable`             |
| BTN-5 | 正常系 | 結果は表ごとに表示する                                                                                  | `copyTable`             |
| BTN-6 | 正常系 | 結果の表示中に押し直したら、3 秒を数え直す                                                              | `syncCopyResult`            |

## 2. 表の検出

| ID     | 区分   | 仕様                                                                                          | 実装                         |
| ------ | ------ | --------------------------------------------------------------------------------------------- | ---------------------------- |
| SEG-1  | 正常系 | 表の前後の文章と表を、回答の順に分ける                                                        | `splitTablesFromAssistantMessage`                |
| SEG-2  | 正常系 | 表がない回答は、通常の部分1つにする                                                           | `splitTablesFromAssistantMessage`                |
| SEG-3  | 正常系 | 複数の表は、それぞれ別の表にする                                                              | `splitTablesFromAssistantMessage`                |
| SEG-4  | 正常系 | 配置指定の区切り行 (`:--`、`--:`) と、外側の `\|` がない表も表にする                          | `splitTablesFromAssistantMessage`                |
| SEG-6  | 正常系 | 区切り行がまだない表と、区切り行が途中までの表は、表にしない (回答の生成途中への対応)         | `isTableStart`                |
| SEG-7  | 正常系 | 見出し行と区切り行の列数が違うものと、区切り行だけの水平線は、表にしない                      | `isTableStart`                |
| SEG-8  | 正常系 | 引用とリストの中の表は、表にしない                                                            | `isTableStart`                |
| SEG-9  | 正常系 | 表の行は、空行か `\|` のない行で終わる                                                        | `splitTablesFromAssistantMessage`                |
| SEG-10 | 正常系 | 改行が CRLF でも、LF にそろえて分ける                                                         | `splitTablesFromAssistantMessage`                |
