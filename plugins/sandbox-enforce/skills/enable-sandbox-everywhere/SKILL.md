---
name: enable-sandbox-everywhere
description: |
  このスキルは、ユーザーが「sandboxを全部有効にして」「sandboxが有効か確認して」
  「sandbox.enabled を確認/有効化して」のように、PC上の全プロジェクトの
  sandbox.enabled 設定を点検し有効化したい場合に使用する
compatibility: Requires Python 3
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: AskUserQuestion Bash(python3 "${CLAUDE_PLUGIN_ROOT}/skills/enable-sandbox-everywhere/scripts/scan_sandbox.py" *)
---

# enable-sandbox-everywhere

## 概要

`sandbox.enabled` はマシン全体の managed/user 設定だけでなく、プロジェクトごとの
`.claude/settings.json` / `.claude/settings.local.json` にも個別に書け、そのプロジェクトで
作業したときだけ効く。そのため「このPCで全て有効か」を確かめるには、カレントディレクトリだけ
でなく HOME 配下 (WSL2 環境では加えて Windows 側の各ユーザの `.claude`) を横断走査する必要がある

本スキルは既定でその全PC走査を行い、無効なものを確認のうえ有効化する

有効化の方針は「各ファイルを true に書き換える」ではなく「WSL 側・Windows 側それぞれの
`~/.claude/settings.json` (installation の user 設定) に集約し、他のプロジェクト設定からは
`sandbox.enabled` キー自体を削除して上位設定を継承させる」こととする。設定の重複を避け、
将来 sandbox の方針を変える際の変更点を1か所に保つため

このスキルは `Read` / `Edit` / `Write` を持たない。書込は必ず `scripts/scan_sandbox.py --fix`
経由で行う。`~/.claude/settings.json` の `env` には API トークン等の機密値が含まれており、
Read してから Edit する方式だとそれらの値が会話コンテキストに載ってしまうため

## 手順

### 1. 全PC走査 (読取専用・副作用なし・既定動作)

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/enable-sandbox-everywhere/scripts/scan_sandbox.py"
```

末尾の機械可読な行で分岐する

- `RESULT: NO_DISABLED` -> 無効なファイルなし。依存パッケージ (`DEPS_OK` 確認) も含めて報告し**終了**
- `RESULT: DISABLED_FOUND` -> 手順2以降へ
- `RESULT: ONLY_CURRENT_DISABLED` -> カレントセッション自身のみ無効。手順6へ
- `RESULT: SCAN_FAILED` -> settings ファイルが1件も見つからなかった。原因を報告して終了
- `WARNING: INCOMPLETE_SCAN <n>` -> 実際に権限で弾かれたディレクトリ/ファイルがあった旨。件数と代表パスをユーザに伝える (推測ではなく実測に基づく警告)

出力される主な行と対応する対象:

| 行 | 意味 | 対応する action |
| --- | --- | --- |
| `USER_SETTINGS_FIX_NEEDED:<path>` | WSL側 `~/.claude/settings.json` (集約先自身) が false | `set-true` |
| `FIX_TARGET:<path>` | WSL側のプロジェクト設定が false | `remove-key` |
| `CURRENT_SESSION_DISABLED:<path>` | カレントセッション自身の設定が false | 自動修正しない (手順6) |
| `WINDOWS_USER_SETTINGS_FIX_NEEDED:<path>` | Windows側 `<user>/.claude/settings.json` が false | `set-true` |
| `WINDOWS_TARGET:<path>` | Windows側のプロジェクト設定 (`settings.local.json`) が false | `remove-key` |
| `MANAGED_DISABLED:<label>:<path>` | 管理者(managed)設定が無効化 | 修正不可。報告のみ |
| `DEPS_MISSING:<bin>` | sandbox 依存パッケージが不足 | 手順2 |

managed 設定が無効化しているファイルは修正できないため、その旨を報告するのみで対象から除く

### 2. 依存パッケージの確認

`DEPS_MISSING` が出力されていた場合、`sandbox.enabled` を `true` にしても実際には
sandbox が起動せず非sandboxで実行されることをユーザに先に伝える。導入コマンド例
(`sudo apt install bubblewrap socat`) を提示するのみで、実行はしない

`DEPS_MISSING_OPTIONAL:rg` は `ripgrep` が PATH 上にない旨だが、Claude Code 本体に
同梱されるため致命的ではないことも併せて伝える

### 3. WSL側 user設定の有効化 (集約先)

`USER_SETTINGS_FIX_NEEDED` が出力されていた場合、`~/.claude/settings.json` に
`sandbox.enabled: true` を設定する旨をユーザに提示し、**明示的な承認を得る**。
承認が得られなければ以降の手順も中止する

承認後:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/enable-sandbox-everywhere/scripts/scan_sandbox.py" --fix <path> --action set-true
```

### 4. WSL側プロジェクト設定の false キー削除

`FIX_TARGET` の一覧 (ファイルパス) をそのままユーザに提示し、それぞれ `sandbox.enabled`
キーを削除して手順3の user 設定を継承させる旨の**明示的な承認を得る**。ファイル全体が
`json.dump` により再フォーマットされること (インデント幅・空行が変わり得ること) と、
書込前に `<path>.bak` が作成されることも併せて伝える。承認が得られなければ中止する

承認後、対象ファイルを1件ずつ処理する:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/enable-sandbox-everywhere/scripts/scan_sandbox.py" --fix <path> --action remove-key
```

### 5. Windows側の確認 (WSL環境のみ)

`WINDOWS_USER_SETTINGS_FIX_NEEDED` および `WINDOWS_TARGET` は、WSL とは別の
Windows 側 Claude Code インストールの設定であるため、手順3・4とは**分けて個別に承認を得る**。
承認後は同様に `--fix <path> --action set-true` (前者) / `--fix <path> --action remove-key` (後者) を実行する

### 6. カレントセッション自身の設定 (手動確認・最後に案内)

`CURRENT_SESSION_DISABLED` が出力されていた場合、**この項目は自動修正しない**。ユーザが
このプロジェクトの sandbox を意図的に無効化して全PC走査を可能にしたケースがあるため、
他の全ファイルの修正が完了した後、最後に案内する:

- 対象ファイルパスと、`sandbox.enabled` を有効化する (または該当キーを削除して上位設定を
  継承させる) ことの意味 (このセッション自身の保護が復帰すること、反映には再起動が必要な
  場合があること) を伝える
- 実際の変更は自動で行わず、**ユーザ自身の操作**で戻してもらう (または、ユーザから明示的に
  依頼された場合のみ、手順4と同様の確認つきで `--fix` を実行する)

### 7. 再走査と最終報告

手順1のスクリプトを再実行し、修正したファイルが期待どおりの状態になったことを確認する

`FIX_TARGET` / `WINDOWS_TARGET` / `USER_SETTINGS_FIX_NEEDED` /
`WINDOWS_USER_SETTINGS_FIX_NEEDED` を全て解消できたか、`CURRENT_SESSION_DISABLED` が
残っているかをまとめて報告する

## デバッグ用: カレント環境の実効値のみ確認

「今この場所で実際に使われる値だけ知りたい」場合は次を使う (通常のチェックには使わない):

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/enable-sandbox-everywhere/scripts/scan_sandbox.py" --current
```

managed > project local > project > user の優先順位で、カレントディレクトリの実効値と
`DECIDED_BY` を返す

## 出力ルール

- コマンドが失敗した場合、回避策を試さず失敗内容をそのまま報告する
- スクリプトが標準出力に出した以外の設定値をファイルから読み出さない (`--fix` の出力は
  `sandbox.enabled` の真偽値と対象パスのみで、他のキーの値は表示されない)
- 管理者設定 (managed-settings) が sandbox を無効化している場合、それを回避しない
- sandbox 有効化後、一部の bash コマンドが sandbox 経由になり環境によっては失敗し得る。
  失敗時に sandbox を無効化して回避するのではなく原因を確認するようユーザに伝える

## セキュリティ / 注意

- 各プロジェクトの `.claude/settings.local.json` 等は**そのプロジェクト固有の設定**。
  書込前に対象ファイルの一覧を必ず確認する
- 書込は必ず `scripts/scan_sandbox.py --fix` 経由で行い、`Read`/`Edit`/`Write` で
  ファイル全文をやり取りしない。`~/.claude/settings.json` 等には API トークンを含む
  `env` キーが含まれ得るため
- 管理者設定 (managed) が sandbox を無効化している場合、それを回避しない。ユーザ設定
  では覆せない
- **カレントセッション自身の設定は自動修正しない** (手順6)。ユーザが診断のために意図的
  に無効化した可能性があり、セッション自身の保護に関わるため、戻す操作はユーザ主導で行う
- 全PC走査は実行時の権限次第で一部ディレクトリを取りこぼす可能性がある
  (`WARNING: INCOMPLETE_SCAN`)。この警告が出た場合は結果が不完全であることをユーザに明示する

## よくある間違い

- **カレントディレクトリだけのチェックで済ませる**: project/local 設定はプロジェクトごとに
  別ファイルのため、カレントだけ見ても他プロジェクトの無効化を見逃す。必ず既定の全PC走査
  (手順1) を使う
- **WSL側だけ見てWindows側を見落とす**: 同一PC上に WSL の Claude Code と Windows 版の
  Claude Code が別々にインストールされていることがあり、設定ファイルも別々に存在する
- **カレントセッション自身を他ファイルと同じバッチで自動修正する**: ユーザが意図的に無効化
  した可能性があるため、`CURRENT_SESSION_DISABLED` は分離して最後にユーザ主導で扱う
- **`Read`/`Edit` でファイル全文を読み書きする**: 機密値を含む設定ファイルの本文が会話
  コンテキストに載ってしまう。必ず `--fix` 経由にする
- **確認スキップ**: 有効化・削除の書込前のユーザ確認は省略しない

## 構成

```
enable-sandbox-everywhere/
├── SKILL.md
└── scripts/
    └── scan_sandbox.py   # 読取専用の全PC走査/報告 + --fix による限定的な書込
```
