# statusline 仕様

テストが担保する仕様の一覧

- 各行の ID を、テスト名から参照する
- 「実装」は、仕様を実装している関数や定数の名前。名前がない処理は、ファイル名

## 1. 画面の構成

| ID   | 区分   | 仕様                                                                                                                                               | 実装           |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| UI-1 | 正常系 | 並び順は、リロード、git、ディレクトリ、ブランチ名、PR、モデル、output style、ctx、5h、7d、review の3ボタン、node、python、rust、go、bun、terraform | `register.tsx` |
| UI-2 | 正常系 | アンケートが出ている間は、表示しない                                                                                                               | `register.tsx` |
| UI-3 | 正常系 | 未取得の間は、git、ディレクトリ、ブランチ名、node、python、rust、go、bun、terraform、PR、モデル、output style を表示しない。他の項目は常に表示する | `register.tsx` |
| UI-4 | 正常系 | terminal と desktop で表示する。vscode と mobile では表示されない(Claude Code が帯を描画しない)                                                    | `register.tsx` |
| UI-5 | 正常系 | 押せるのは、リロード、ディレクトリ、PR、review の3ボタン。それ以外は押せない                                                                       | `register.tsx` |
| UI-6 | 正常系 | ディレクトリ名に hover している間は、帯の全体を覆って、作業ディレクトリの絶対パスだけを表示する。押すと、絶対パスをコピーする                      | `register.tsx` |

## 2. 各項目の表示

| ID       | 区分   | 項目             | 入力 → 期待する表示                                                                                                                                              | 実装                     |
| -------- | ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| CTX-1    | 正常系 | ctx              | 42.4 → `ctx:42%`。未取得 → `ctx:--`                                                                                                                              | `formatCtx`              |
| CTX-2    | 正常系 | ctx の色         | 未取得 → blue。50未満 → green、50以上 → yellow、80以上 → red。丸めない実際の値で判定する(49.6 は `ctx:50%` で green)                                             | `ctxColor`、`levelColor` |
| RL-1     | 正常系 | レート制限       | 5h → `5h:12%(14:30)`。7d → `7d:40%(10/25 14:30)`。月日と時分は2桁にそろえる(`01/05 07:05`)。該当なし → `5h:--`(blue)                                             | `summarizeRateLimits`    |
| RL-2     | 正常系 | リセット日時なし | 括弧を付けず `5h:12%`                                                                                                                                            | `summarizeRateLimits`    |
| RL-3     | 正常系 | 色               | 使用率で CTX-2 と同じ閾値。丸めない実際の値で判定する                                                                                                            | `levelColor`             |
| RL-4     | 正常系 | 並び             | 5h、7d の順に固定。それ以外の種類は表示しない                                                                                                                    | `RATE_LIMIT_LABELS`      |
| MD-1     | 正常系 | モデル名         | `claude-opus-5-5[1m]` → `opus5.5`。`claude-sonnet-5-5` → `sonnet5.5`。`claude-fable-5-1` → `fable5.1`。Claude 5 以降の命名のみを対象とし、5 より前の形式は対象外 | `formatModel`            |
| MD-2     | 正常系 | モデルの色       | sonnet → green、opus → yellow、fable → red、それ以外(haiku を含む) → blue。大文字小文字は区別しない                                                              | `modelColor`             |
| DIR-1    | 正常系 | ディレクトリ名   | `/home/u/project` → `project`。末尾が `/` でも同じ。ルート → `/`。Windows の `C:\Users\u\project` → `project`                                                    | `directoryName`          |
| DIR-2    | 正常系 | ディレクトリの色 | パスに `worktree` を含む → blue、含まない → yellow                                                                                                               | `workingDirectoryColor`  |
| BRANCH-1 | 正常系 | ブランチ名       | `branch.head` を indigo で表示。detached HEAD、git でない場合は表示しない                                                                                        | `parseBranchName`        |
| GIT-1    | 正常系 | git 状態の色     | unpushed と uncommitted → red、clean → green、no-git → blue                                                                                                      | `gitStatusColor`         |
| OS-1     | 正常系 | output style     | 設定が文字列 → その名前を orange で表示。文字列以外 → 表示しない                                                                                                 | `syncOutputStyle`        |
| PR-1     | 正常系 | PR の表示        | `PR #番号`。色は OPEN → green、DRAFT → white、MERGED → purple、CLOSED → red                                                                                      | `summarizePullRequests`  |
| RV-1     | 正常系 | review ボタン    | `review`、`simplify`、`security` の順。実行済み → green、未実行 → orange                                                                                         | `summarizeReviews`       |
| RLD-1    | 正常系 | リロード         | idle → `↻`(blue)、loading → `…`(yellow)、done → `✓`(green)、failed → `✗`(red)                                                                                    | `summarizeReload`        |

## 3. Node.js のバージョン

starship の `nodejs` モジュールの判定に合わせる

| ID     | 区分   | 仕様                                                                                                                                                                           | 実装                                   |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| NODE-1 | 正常系 | 作業ディレクトリの直下(親は見ない)に、`package.json`、`.node-version`、`.nvmrc`、`node_modules` フォルダ、拡張子 `js`、`mjs`、`cjs`、`ts`、`mts`、`cts` のいずれかがあれば対象 | `isNodeProject`                        |
| NODE-2 | 正常系 | `bunfig.toml`、`bun.lock`、`bun.lockb`、`deno.json`、`deno.jsonc`、`deno.lock`、`esy.lock` フォルダのいずれかがあれば、他の条件によらず対象外                                  | `isNodeProject`                        |
| NODE-3 | 正常系 | 対象のとき、作業ディレクトリで `node --version` を 3000ms のタイムアウトで実行し、先頭の `v` を除いて `node:22.1.0` と green で、一番右に表示する                              | `syncNodeVersion`、`formatNodeVersion` |
| NODE-4 | 異常系 | 終了コードが 0 でなければ、表示しない。起動できない場合とタイムアウトでは、表示せず、デバッグログに残す                                                                        | `fetchNodeVersion`                     |
| NODE-5 | 正常系 | 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す。作業ディレクトリが対象でなくなれば、表示しない                                                                    | `syncNodeVersion`                      |

## 4. Python のバージョン

starship の `python` モジュールの判定に合わせる

| ID   | 区分   | 仕様                                                                                                                                                                                                                                                | 実装                                       |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| PY-1 | 正常系 | 作業ディレクトリの直下(親は見ない)に、`requirements.txt`、`.python-version`、`pyproject.toml`、`Pipfile`、`tox.ini`、`setup.py`、`__init__.py`、拡張子 `py`、`ipynb` のいずれかがあれば対象                                                         | `isPythonProject`                          |
| PY-2 | 正常系 | 環境変数 `VIRTUAL_ENV` が設定されていれば(空でも)、ファイルがなくても対象                                                                                                                                                                           | `isPythonProject`                          |
| PY-3 | 正常系 | 対象のとき、作業ディレクトリで `python`、`python3`、`python2` の順に `--version` を 3000ms のタイムアウトで実行し、最初に成功したものの出力(標準出力が空なら標準エラー出力)の2番目の語を版として、`python:3.12.3` と yellow で、node の右に表示する | `syncPythonVersion`、`formatPythonVersion` |
| PY-4 | 異常系 | 終了コードが 0 でなければ、次の候補を試す。起動できない場合とタイムアウトでも次の候補を試し、デバッグログに残す。すべて失敗したら、表示しない                                                                                                       | `fetchPythonVersion`                       |
| PY-5 | 正常系 | 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す。作業ディレクトリが対象でなくなれば、表示しない                                                                                                                                         | `syncPythonVersion`                        |

## 5. Rust のバージョン

starship の `rust` モジュールを簡易にした。ツールチェーンの特定は行わない

| ID     | 区分   | 仕様                                                                                                                                                                                         | 実装                                   |
| ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| RUST-1 | 正常系 | 作業ディレクトリの直下(親は見ない)に、`Cargo.toml`、または拡張子 `rs` のファイルがあれば対象                                                                                                 | `isRustProject`                        |
| RUST-2 | 正常系 | 対象のとき、作業ディレクトリで `rustc --version` を、`RUSTUP_AUTO_INSTALL=0` を付けて 3000ms のタイムアウトで実行し、出力の2番目の語を版として、`rust:1.92.0` と orange で、一番右に表示する | `syncRustVersion`、`formatRustVersion` |
| RUST-3 | 異常系 | 終了コードが 0 でなければ、表示しない。起動できない場合とタイムアウトでは、表示せず、デバッグログに残す                                                                                      | `fetchRustVersion`                     |
| RUST-4 | 正常系 | 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す。作業ディレクトリが対象でなくなれば、表示しない                                                                                  | `syncRustVersion`                      |

## 6. Go のバージョン

starship の `golang` モジュールを簡易にした。`go.mod` の版との照合は行わない

| ID   | 区分   | 仕様                                                                                                                                                                                                       | 実装                               |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| GO-1 | 正常系 | 作業ディレクトリの直下(親は見ない)に、`go.mod`、`go.sum`、`go.work`、`glide.yaml`、`Gopkg.yml`、`Gopkg.lock`、`.go-version`、`Godeps` フォルダ、拡張子 `go` のいずれかがあれば対象                         | `isGoProject`                      |
| GO-2 | 正常系 | 対象のとき、作業ディレクトリで `go version` を、`GOTOOLCHAIN=local` を付けて 3000ms のタイムアウトで実行し、`go version go1.25.0 …` の `go` の後ろの語を版として、`go:1.25.0` と blue で、一番右に表示する | `syncGoVersion`、`formatGoVersion` |
| GO-3 | 異常系 | 終了コードが 0 でなければ、表示しない。起動できない場合とタイムアウトでは、表示せず、デバッグログに残す                                                                                                    | `fetchGoVersion`                   |
| GO-4 | 正常系 | 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す。作業ディレクトリが対象でなくなれば、表示しない                                                                                                | `syncGoVersion`                    |

## 7. bun のバージョン

starship の `bun` モジュールに合わせる。bun のプロジェクトでは、node は表示しない(NODE-2)

| ID    | 区分   | 仕様                                                                                                                                                  | 実装                                 |
| ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| BUN-1 | 正常系 | 作業ディレクトリの直下(親は見ない)に、`bun.lock`、`bun.lockb`、`bunfig.toml` のいずれかがあれば対象                                                   | `isBunProject`                       |
| BUN-2 | 正常系 | 対象のとき、作業ディレクトリで `bun --version` を 3000ms のタイムアウトで実行し、出力の前後の空白を除いて、`bun:1.2.3` と purple で、一番右に表示する | `syncBunVersion`、`formatBunVersion` |
| BUN-3 | 異常系 | 終了コードが 0 でなければ、表示しない。起動できない場合とタイムアウトでは、表示せず、デバッグログに残す                                               | `fetchBunVersion`                    |
| BUN-4 | 正常系 | 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す。作業ディレクトリが対象でなくなれば、表示しない                                           | `syncBunVersion`                     |

## 8. Terraform のバージョン

starship の `terraform` モジュールに合わせる。starship の既定の表示はワークスペース名だが、このプラグインでは版を表示する

| ID   | 区分   | 仕様                                                                                                                                                                                                                                                     | 実装                                                                      |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| TF-1 | 正常系 | 作業ディレクトリの直下(親は見ない)に、拡張子 `tf`、`tofu`、`tfplan`、`tfstate` のファイル、または `.terraform` フォルダがあれば対象                                                                                                                      | `isTerraformProject`                                                      |
| TF-2 | 正常系 | 対象のとき、作業ディレクトリで `terraform version` を、更新確認を無効(`CHECKPOINT_DISABLE=1`)にして 3000ms のタイムアウトで実行する。出力の1行目から `Terraform` または `OpenTofu` と先頭の `v` を除き、`terraform:1.9.5` と indigo で、一番右に表示する | `syncTerraformVersion`、`parseTerraformVersion`、`formatTerraformVersion` |
| TF-3 | 異常系 | `terraform` が失敗(起動できない、終了コードが 0 でない)なら、`tofu version` を試す。すべて失敗したら表示しない。起動できない場合とタイムアウトは、デバッグログに残す                                                                                     | `fetchTerraformVersion`                                                   |
| TF-4 | 正常系 | 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す。作業ディレクトリが対象でなくなれば、表示しない                                                                                                                                              | `syncTerraformVersion`                                                    |

## 9. git 状態の判定

| ID    | 区分   | 条件                                                     | 結果                                |
| ----- | ------ | -------------------------------------------------------- | ----------------------------------- |
| GIT-2 | 異常系 | `git status` の終了コードが 0 でない                     | no-git                              |
| GIT-3 | 正常系 | 最初のコミット前、または detached HEAD                   | unpushed にならない                 |
| GIT-4 | 正常系 | 上流がない(新しいブランチ)                               | unpushed                            |
| GIT-5 | 正常系 | 上流より先行(`+1` 以上)                                  | unpushed                            |
| GIT-6 | 正常系 | 上流と同じ、または遅れているだけ(`+0 -3`)                | unpushed にならない                 |
| GIT-7 | 正常系 | 変更ファイルがある                                       | uncommitted。ただし unpushed が優先 |
| GIT-8 | 正常系 | 上記のいずれでもない                                     | clean                               |
| GIT-9 | 正常系 | `git` は `--no-optional-locks -C <cwd>` を付けて実行する | `syncGitStatus`                     |

## 10. PR の取得

| ID    | 区分           | 仕様                                                                                                                 | 実装                      |
| ----- | -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| PR-2  | 正常系         | 現在のブランチの PR を `gh pr list --head <branch> --state all` で取得する。タイムアウト 5 秒                        | `fetchPullRequestsToShow` |
| PR-3  | 正常系         | 表示は1件のみ。優先順は OPEN、DRAFT、MERGED、CLOSED。同じ状態なら番号が大きいもの                                    | `pickPullRequests`        |
| PR-4  | 正常系         | OPEN でドラフトのものは DRAFT として扱う                                                                             | `toPullRequest`           |
| PR-5  | 正常系         | `https://github.com/` で始まる URL のみ対象                                                                          | `pickPullRequests`        |
| PR-6  | 正常系         | ブランチ名が空(detached など)では `gh` を呼ばない                                                                    | `syncPullRequests`        |
| PR-7  | 正常系         | 成功後 5 分間は再取得しない                                                                                          | `scheduleRefresh`         |
| PR-8  | 異常系         | 失敗後 60 秒間は再取得しない。失敗はデバッグログに残す。失敗しても前回の PR は表示したまま残す(ブランチが変わるまで) | `scheduleRetry`           |
| PR-9  | 正常系         | 作業ディレクトリかブランチが変わったら、前の PR を消す                                                               | `changeTarget`            |
| PR-10 | 正常系         | 手動リロードでは、間隔によらず取得する                                                                               | `clearPullRequestCache`   |
| PR-11 | 正常系         | 取得中の呼び出しは、無視する                                                                                         | `startFetching`           |
| PR-12 | 正常系・異常系 | PR ボタンを押すと `gh pr view <url> --web`。失敗はデバッグログ                                                       | `openPullRequest`         |

## 11. ボタンの動作

| ID    | 区分           | 仕様                                                                                                           | 実装                   |
| ----- | -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------- |
| BTN-1 | 正常系・異常系 | ディレクトリ名を押すと、絶対パスをコピーする。失敗はデバッグログ                                               | `copyWorkingDirectory` |
| BTN-2 | 正常系         | review 系を押すと、入力欄を `/<command>` に置き換える。コマンドは `code-review`、`simplify`、`security-review` | `pressReview`          |
| BTN-3 | 正常系・異常系 | 入力できた場合のみ、実行済みにする。失敗はデバッグログ                                                         | `pressReview`          |
| BTN-4 | 正常系         | リロードを押すと、キャッシュを削除し、全項目を更新する                                                         | `reloadManually`       |
| BTN-5 | 正常系         | 実行中の押下は無視する(連打で同期は1回)                                                                        | `reloadManually`       |
| BTN-6 | 正常系         | 完了後 3 秒間 `✓` を表示して idle に戻る                                                                       | `reloadManually`       |
| BTN-7 | 異常系         | 更新が失敗したらデバッグログを残し、`✗`(red) を 3 秒間表示して idle に戻る                                     | `reloadManually`       |

## 12. イベント

| ID    | 区分   | イベント                                         | 更新する項目                                                                   |
| ----- | ------ | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| EV-1  | 正常系 | `session.start`                                  | すべて(PR は次のタイマーで)                                                    |
| EV-2  | 正常系 | `turn.complete`(メインエージェントのみ)          | すべて                                                                         |
| EV-3  | 正常系 | `session.measure`                                | `changed` に context があれば ctx、rateLimits があればレート制限               |
| EV-4  | 正常系 | `classic.PostCompact`                            | ctx                                                                            |
| EV-5  | 正常系 | `config.set`                                     | 元の処理の後に output style                                                    |
| EV-6  | 正常系 | `/model`                                         | 元の処理の後にモデル名のみ                                                     |
| EV-7  | 正常系 | `/output-style`                                  | 元の処理の後に output style のみ                                               |
| EV-8  | 正常系 | `/cd`、`/clear`、`/resume`、`/branch`、`/rewind` | 元の処理の後に、次のタイマーで全項目                                           |
| EV-9  | 正常系 | 上記以外のコマンド                               | 何もしない                                                                     |
| EV-10 | 正常系 | すべてのイベント                                 | 元のイベントの結果を変えずに返す                                               |
| EV-11 | 異常系 | 更新で例外が起きた場合(`git` が起動できないなど) | 項目ごとの隔離はしない。フックはエンジンの挙動でスキップされ、セッションは続く |

## 13. テストの対応

| テストファイル             | 対応する ID                |
| -------------------------- | -------------------------- |
| `register.test.tsx`        | UI-1〜6、EV-1〜11          |
| `ctx.test.ts`              | CTX-1、CTX-2               |
| `nodejs.test.ts`           | NODE-1〜5                  |
| `python.test.ts`           | PY-1〜5                    |
| `rust.test.ts`             | RUST-1〜4                  |
| `go.test.ts`               | GO-1〜4                    |
| `bun.test.ts`              | BUN-1〜4                   |
| `terraform.test.ts`        | TF-1〜4                    |
| `rateLimits.test.ts`       | RL-1〜4                    |
| `model.test.ts`            | MD-1、MD-2                 |
| `workingDirectory.test.ts` | DIR-1、DIR-2、BTN-1        |
| `gitStatus.test.tsx`       | GIT-1〜9、BRANCH-1         |
| `outputStyle.test.ts`      | OS-1                       |
| `pullRequest.test.tsx`     | PR-1〜12                   |
| `review.test.tsx`          | RV-1、BTN-2、BTN-3         |
| `reload.test.tsx`          | RLD-1、BTN-4〜7            |
| `helpers.ts`               | 共通の準備(テストではない) |

## 14. 確認事項

| 番号 | 内容                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | UI-4 の vscode と mobile は、mod にコードがないため、テストの対象外                                                                                                                          |
| 2    | UI-4 の desktop は、テストキット上の描画のみを確認している。実機では未確認                                                                                                                   |
| 3    | BTN-3 の入力失敗の理由は、スタブから渡せないため、`unknown` の経路のみを検証している                                                                                                         |
| 4    | EV-11 は、「session.start が完了し、以降も描画できる」ことのみを検証している                                                                                                                 |
| 5    | 狭い幅での表示と、帯を畳んだ状態の動作は、仕様として未定義                                                                                                                                   |
| 6    | `formatModel` は、末尾の日付(`-20251001` など)を削除する処理を持つ。Claude 5 以降の ID に日付が付くか未確認で、不要な可能性                                                                  |
| 7    | haiku の色は、blue(未知のモデルと同じ)と仮定している                                                                                                                                         |
| 8    | UI-5 の「3ボタン」は、種類の数。押せる項目は、PR を含めて最大 6 つ。UI-6 の絶対パス表示のボタンは、ディレクトリのボタンと同じ種類                                                           |
| 9    | Node.js の表示は `node:22.1.0`(starship の `v` 付きと異なる)と green で、私の案。形式と色の確認が必要                                                                                        |
| 10   | Node.js の判定は、starship の既定に合わせた(カレントのみ、deno・bun・esy の除外、取得失敗は非表示。タイムアウトは 3000ms)。`engines.node` による色の変更は対象外                             |
| 11   | Python の表示は `python:3.12.3` と yellow で、node の右に置いた(私の案)。形式、色、位置の確認が必要                                                                                          |
| 12   | Python の判定は、starship の既定に合わせた(カレントのみ、候補は python・python3・python2、取得失敗は非表示。タイムアウトは 3000ms)。仮想環境の名前、pyenv の設定は対象外                     |
| 13   | 環境変数 `VIRTUAL_ENV` は、starship に合わせ、空文字でも設定済みとして扱う                                                                                                                   |
| 14   | Rust の表示は `rust:1.92.0` と orange で、python の右に置いた(私の案)。形式、色、位置の確認が必要                                                                                            |
| 15   | Rust は簡易版。`rust-toolchain.toml` や `rustup override` の特定は行わず、`rustc --version` の結果をそのまま使う。未導入のツールチェーンは、自動インストールを無効にするため、何も表示しない |
| 16   | `RUSTUP_AUTO_INSTALL=0` は rustup 1.28.1 以降で有効。古い rustup では、無視されて自動インストールが起こり得る                                                                                |
| 17   | Go の表示は `go:1.25.0` と blue で、rust の右に置いた(私の案)。形式、色、位置の確認が必要                                                                                                    |
| 18   | Go は簡易版。`GOTOOLCHAIN=local` で実行するため、表示は、`go.mod` が指す版ではなく、ローカルに入っている Go の版。`go.mod` の版との照合による色の変更は行わない                              |
| 19   | 版の取得のタイムアウトは、4 言語で共通の 3000ms(starship の既定は 500ms)。`go` が snap や shim 経由で遅く、500ms で打ち切られたため                                                          |
| 20   | bun の表示は `bun:1.2.3` と purple で、go の右(一番右)に置いた(私の案)。形式、色、位置の確認が必要                                                                                           |
| 21   | Terraform の表示は `terraform:1.9.5` と indigo で、bun の右(一番右)に置いた(私の案)。OpenTofu の場合も `terraform:` と表示する。ワークスペース名は表示しない。形式、色、位置の確認が必要     |
| 22   | UI-6 の hover による全体表示は、テストキット上のツリー(`hover` の scope と `display: "flex"`、絶対配置)のみを確認している。実機での hover の届き方、折り返し時の覆い方、背景色 blue の見た目は未確認。端末の背景色は取得できないため、blue に固定した |
