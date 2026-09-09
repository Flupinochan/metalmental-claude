#!/usr/bin/env python3
"""Claude Code の sandbox マスタースイッチ (sandbox.enabled) を機械全体で点検する読取専用スクリプト.

sandbox.enabled はマシン全体の managed/user 設定だけでなく,
プロジェクトごとの .claude/settings.json / .claude/settings.local.json にも
個別に書け, それらは「そのプロジェクトで作業したときだけ」有効になる.
そのため「このPCで全て有効か」を判定するには, カレントディレクトリだけ
見ても不十分で, HOME 配下 (WSL2 環境では加えて Windows 側の各ユーザの
~/.claude も) を横断走査する必要がある.

使い方:
  scan_sandbox.py                      HOME 配下 (+WSL では Windows 側) を横断走査 (既定)
  scan_sandbox.py --current            カレントディレクトリで実際に使われる実効値のみ確認 (デバッグ用)
  scan_sandbox.py --deps               sandbox の依存パッケージ (bubblewrap/socat/ripgrep) のみ確認
  scan_sandbox.py --fix <path> --action set-true|remove-key [--dry-run]
                                        1ファイルのみ書込 (ユーザ承認後にスキルから呼ぶ)

書込モード (--fix) の方針:
  - set-true    : そのファイルを「installation の user 設定」として sandbox.enabled を true にする
                  (対象: WSL 側 ~/.claude/settings.json, Windows 側 <user>/.claude/settings.json)
  - remove-key  : sandbox.enabled キーのみ削除し, 上位設定 (user 設定) の値を継承させる
                  (対象: それ以外のプロジェクト単位の settings.json / settings.local.json)
  - 書込前に <path>.bak を作成する
  - ファイル本文は一切標準出力に出さない (sandbox.enabled の真偽値と対象パスのみ)

終了コード: 0=問題なし, 1=false検出あり(または書込成功), 2=判定不能/エラー

優先順位 (--current 使用時のみ意味を持つ): managed > project local > project > user
"""

import argparse
import json
import os
import platform
import shutil
import sys

HOME = os.path.expanduser("~")
CWD = os.getcwd()

# ---------------------------------------------------------------------------
# 共通: 1ファイルの sandbox.enabled 状態を読む
# ---------------------------------------------------------------------------

STATE_MISSING = "missing"   # ファイルが存在しない
STATE_UNSET = "unset"       # ファイルはあるが sandbox.enabled 未設定
STATE_TRUE = "true"         # sandbox.enabled: true
STATE_FALSE = "false"       # sandbox.enabled: false
STATE_ERROR = "error"       # JSON 解析エラー等

LABEL = {
    STATE_MISSING: "ファイルなし",
    STATE_UNSET: "未設定",
    STATE_TRUE: "enabled = true",
    STATE_FALSE: "enabled = false",
    STATE_ERROR: "解析エラー",
}

# 全PC走査で os.walk / open が実際に弾かれた回数 (推測ではなく実測でのみ INCOMPLETE_SCAN を報告する)
_scan_denied = []  # list[str] (代表パスを最大3件保持)
_scan_denied_count = 0


def _record_denied(path):
    global _scan_denied_count
    _scan_denied_count += 1
    if len(_scan_denied) < 3:
        _scan_denied.append(path)


def read_enabled(path):
    """1 ファイルを読んで sandbox.enabled の状態を返す. (state, detail)."""
    if not os.path.isfile(path):
        return STATE_MISSING, None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except PermissionError as e:
        _record_denied(path)
        return STATE_ERROR, str(e)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
        return STATE_ERROR, str(e)

    if not isinstance(data, dict):
        return STATE_ERROR, "トップレベルが JSON オブジェクトではありません"

    sandbox = data.get("sandbox")
    if not isinstance(sandbox, dict) or "enabled" not in sandbox:
        return STATE_UNSET, None

    value = sandbox.get("enabled")
    if value is True:
        return STATE_TRUE, None
    if value is False:
        return STATE_FALSE, None
    return STATE_ERROR, f"enabled の値が真偽値ではありません: {value!r}"


# ---------------------------------------------------------------------------
# プラットフォーム判定 / managed 設定パス
# ---------------------------------------------------------------------------


def is_wsl():
    if platform.system() != "Linux":
        return False
    try:
        with open("/proc/version", "r", encoding="utf-8", errors="ignore") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def managed_sources_for(base_dir):
    """base_dir 配下の managed-settings.json + managed-settings.d/*.json を優先順位順で返す."""
    sources = []
    main = os.path.join(base_dir, "managed-settings.json")
    if os.path.isfile(main):
        sources.append(main)
    d = os.path.join(base_dir, "managed-settings.d")
    if os.path.isdir(d):
        try:
            names = sorted(os.listdir(d))
        except PermissionError:
            _record_denied(d)
            names = []
        for name in names:
            if name.endswith(".json"):
                sources.append(os.path.join(d, name))
    return sources


def collapse_sources(sources):
    """複数ファイルを優先順位順 (低->高, 後勝ち) で1つの状態にまとめる."""
    state, detail, decided_path = STATE_MISSING, None, None
    rows = []
    for path in sources:
        s, d = read_enabled(path)
        rows.append((path, s, d))
        if s in (STATE_TRUE, STATE_FALSE):
            state, detail, decided_path = s, d, path
    return state, detail, decided_path, rows


def get_managed_layers():
    """(ラベル, ファイル一覧) の組を OS ごとに返す. 修正不可, 報告のみ."""
    system = platform.system()
    layers = []
    if system == "Darwin":
        layers.append(("managed", managed_sources_for("/Library/Application Support/ClaudeCode")))
    elif system == "Linux":
        layers.append(("managed", managed_sources_for("/etc/claude-code")))
        if is_wsl():
            win_base = "/mnt/c/Program Files/ClaudeCode"
            if os.path.isdir(win_base):
                layers.append(("managed(win)", managed_sources_for(win_base)))
    else:
        layers.append(("managed", managed_sources_for("/etc/claude-code")))
    return layers


# ---------------------------------------------------------------------------
# Windows 側ユーザ (/mnt/c/Users/<user>/.claude) の走査 (WSL 専用, 1階層のみ)
# ---------------------------------------------------------------------------

WINDOWS_USERS_EXCLUDE = {"Default", "Default User", "Public", "All Users", "desktop.ini"}


def scan_windows_users():
    """/mnt/c/Users/*/.claude/{settings.json,settings.local.json} を返す.

    /mnt/c は drvfs 経由で低速なため, ここでは深い走査をせず
    各ユーザの .claude 直下 2 ファイルのみを見る.
    戻り値: list[(user, path, state, detail, is_anchor)]
    """
    results = []
    users_dir = "/mnt/c/Users"
    if not os.path.isdir(users_dir):
        return results
    try:
        users = sorted(os.listdir(users_dir))
    except (PermissionError, OSError):
        _record_denied(users_dir)
        return results

    for user in users:
        if user in WINDOWS_USERS_EXCLUDE:
            continue
        claude_dir = os.path.join(users_dir, user, ".claude")
        if not os.path.isdir(claude_dir):
            continue
        for name, is_anchor in (("settings.json", True), ("settings.local.json", False)):
            fpath = os.path.join(claude_dir, name)
            if os.path.isfile(fpath):
                state, detail = read_enabled(fpath)
                results.append((user, fpath, state, detail, is_anchor))
    return results


# ---------------------------------------------------------------------------
# 依存パッケージチェック (Linux/WSL のみ意味を持つ)
# ---------------------------------------------------------------------------

REQUIRED_BINS = ["bwrap", "socat"]
OPTIONAL_BINS = ["rg"]  # Claude Code 本体に同梱されるため PATH 上になくても致命的ではない


def check_deps(print_output=True):
    """(ok: bool, missing_required: list[str], missing_optional: list[str])."""
    system = platform.system()
    if system == "Darwin":
        if print_output:
            print("macOS では sandbox は Seatbelt 内蔵のため, 追加パッケージは不要です")
            print("DEPS_OK")
        return True, [], []
    if system != "Linux":
        if print_output:
            print(f"未対応プラットフォーム ({system}) のため依存チェックをスキップします")
        return True, [], []

    missing_required = [b for b in REQUIRED_BINS if shutil.which(b) is None]
    missing_optional = [b for b in OPTIONAL_BINS if shutil.which(b) is None]

    if print_output:
        print("Claude Code sandbox 依存パッケージチェック (Linux/WSL)")
        print("=" * 44)
        for b in REQUIRED_BINS:
            found = shutil.which(b)
            print(f"  [{'OK' if found else '不足'}] {b}" + (f" ({found})" if found else ""))
        for b in OPTIONAL_BINS:
            found = shutil.which(b)
            print(f"  [{'OK' if found else '不足(任意)'}] {b}" + (f" ({found})" if found else ""))
        print()
        if missing_required:
            print("必須パッケージが不足しています。sandbox.enabled を true にしても sandbox は起動せず,")
            print("非sandboxで実行されます。導入コマンド例 (実行はしません):")
            print("  sudo apt install bubblewrap socat")
            for b in missing_required:
                print(f"DEPS_MISSING:{b}")
        else:
            print("DEPS_OK")
        for b in missing_optional:
            print(f"DEPS_MISSING_OPTIONAL:{b}")

    return (len(missing_required) == 0), missing_required, missing_optional


# ---------------------------------------------------------------------------
# --current: カレントディレクトリで実際に使われる実効値のみ確認
# ---------------------------------------------------------------------------

USER_SETTINGS_PATH = os.path.join(HOME, ".claude", "settings.json")

LOCAL_LAYERS = [
    ("local", os.path.join(CWD, ".claude", "settings.local.json")),
    ("project", os.path.join(CWD, ".claude", "settings.json")),
    ("user", USER_SETTINGS_PATH),
]


def check_current():
    print("Claude Code sandbox チェック: カレント環境の実効値のみ (--current)")
    print("=" * 44)
    print()
    print("対象ファイル (優先順位: 高 -> 低)")

    layer_states = []
    for label, sources in get_managed_layers():
        state, _detail, decided_path, rows = collapse_sources(sources)
        for path, s, d in rows:
            line = f"  [{label:<11}] {path}: {LABEL[s]}"
            if s == STATE_ERROR and d:
                line += f" ({d})"
            print(line)
        if not rows:
            print(f"  [{label:<11}] (ファイルなし)")
        layer_states.append((label, state, decided_path))

    for name, path in LOCAL_LAYERS:
        s, d = read_enabled(path)
        line = f"  [{name:<11}] {path}: {LABEL[s]}"
        if s == STATE_ERROR and d:
            line += f" ({d})"
        print(line)
        layer_states.append((name, s, path))

    effective = False
    decided_by = "default"
    for name, s, _path in layer_states:
        if s in (STATE_TRUE, STATE_FALSE):
            effective = (s == STATE_TRUE)
            decided_by = name
            break

    errored = [n for n, s, _ in layer_states if s == STATE_ERROR]
    if errored:
        print()
        print(f"  警告: 次のレイヤで解析エラーが発生しました: {', '.join(errored)}")

    print()
    print("-" * 44)
    verdict = "有効" if effective else "無効"
    print(f"実効 sandbox.enabled : {str(effective).lower()}  => {verdict}")
    if decided_by == "default":
        print("決定レイヤ           : default (どのファイルにも未設定 = 既定で無効)")
    else:
        print(f"決定レイヤ           : {decided_by}")

    print()
    print(f"RESULT: {'ENABLED' if effective else 'DISABLED'}")
    print(f"DECIDED_BY: {decided_by}")

    if not effective and decided_by.startswith("managed"):
        print(
            "NOTE: 管理者(managed)設定で無効化されています。"
            "ユーザ設定では上書きできないため、有効化には管理者ポリシーの変更が必要です。"
        )

    return 0 if effective else 1


# ---------------------------------------------------------------------------
# 既定モード: 全PC走査
# ---------------------------------------------------------------------------

PRUNE = {
    # 参考実装 (macOS 向け cars-sandbox-plugin) から引き継いだ除外
    "node_modules", ".git", "Library", ".cache", ".Trash", ".npm",
    ".cargo", ".rustup", ".pyenv", ".venv", "venv", "__pycache__",
    ".next", ".nuxt", "dist", "build", ".terraform", ".gradle", ".m2",
    "Pictures", "Movies", "Music",
    # WSL2 実測で混入が確認された分 + よくある重いディレクトリ
    ".bun", ".vscode-server", ".vscode", ".nvm", ".deno", ".pnpm-store",
    ".yarn", ".local", "go", "site-packages", ".tox", "target", "vendor",
    ".claude-server-commander",
}
MAX_DEPTH = 8  # HOME からの相対深さ上限 (暴走防止)


def _prune_onerror(_path, exc):
    # os.walk の onerror: 権限エラー等で降りられなかったディレクトリを記録する
    if isinstance(exc, PermissionError):
        _record_denied(getattr(exc, "filename", None) or str(exc))


def walk_home():
    """HOME 配下の settings.json / settings.local.json を集める.

    worktree 運用 (このリポジトリの .claude/worktrees/<name>/) を取りこぼさないため,
    .claude ディレクトリに到達しても直下2ファイルを読んだ後 'worktrees' サブディレクトリ
    にだけ潜り続ける (それ以外は打ち切る).
    """
    found = []  # (path, state, detail)

    for dirpath, dirnames, filenames in os.walk(HOME, onerror=_prune_onerror):
        rel = os.path.relpath(dirpath, HOME)
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if depth >= MAX_DEPTH:
            dirnames[:] = []
            continue

        if os.path.basename(dirpath) == ".claude":
            for name in ("settings.json", "settings.local.json"):
                fpath = os.path.join(dirpath, name)
                if os.path.isfile(fpath):
                    state, detail = read_enabled(fpath)
                    found.append((fpath, state, detail))
            # worktree 配下だけ下降を続け, それ以外 (plugins/cache 等) は打ち切る
            dirnames[:] = [d for d in dirnames if d == "worktrees"]
            continue

        dirnames[:] = [d for d in dirnames if d not in PRUNE]

    return found


def scan_all():
    print("Claude Code sandbox 全PC走査 (読取専用・既定モード)")
    print("=" * 50)
    print()

    wsl = is_wsl()
    print(f"実行環境: {platform.system()}" + (" (WSL2)" if wsl else ""))
    print()

    # --- managed 層 (報告のみ, 修正不可) ---
    print("マシン全体設定 (managed, 修正不可):")
    managed_disabled = []  # (label, path)
    for label, sources in get_managed_layers():
        state, _detail, decided_path, rows = collapse_sources(sources)
        if not rows:
            print(f"  [{label}] ファイルなし")
            continue
        for path, s, d in rows:
            line = f"  [{label}][{LABEL[s]}] {path}"
            if s == STATE_ERROR and d:
                line += f" ({d})"
            print(line)
        if state == STATE_FALSE:
            managed_disabled.append((label, decided_path))
    print()

    # --- 依存パッケージ ---
    deps_ok, deps_missing, deps_missing_opt = check_deps(print_output=False)

    # --- WSL 側 HOME 走査 ---
    print(f"走査対象 (WSL/ローカル): {HOME} 配下の全 .claude/settings*.json (深さ<= {MAX_DEPTH})")
    print(f"除外ディレクトリ: {', '.join(sorted(PRUNE))}")
    print()

    found = walk_home()

    if not found:
        print("settings ファイルが 1 件も見つかりませんでした")
        print("RESULT: SCAN_FAILED")
        return 2

    current_paths = {
        os.path.realpath(os.path.join(CWD, ".claude", "settings.local.json")),
        os.path.realpath(os.path.join(CWD, ".claude", "settings.json")),
    }
    user_settings_real = os.path.realpath(USER_SETTINGS_PATH)

    user_settings_state = STATE_MISSING
    fix_targets = []          # remove-key 対象 (WSL 側プロジェクト設定)
    current_disabled = []     # カレントセッション自身 (自動修正対象外)

    for path, state, detail in sorted(found):
        real = os.path.realpath(path)
        tag = ""
        if real == user_settings_real:
            user_settings_state = state
            tag = "  <- WSL user設定 (このインストールの集約先)"
        elif real in current_paths:
            tag = "  <- カレントセッション自身の設定"

        line = f"  [{LABEL[state]}] {path}{tag}"
        if state == STATE_ERROR and detail:
            line += f" ({detail})"
        print(line)

        if state != STATE_FALSE:
            continue
        if real == user_settings_real:
            continue  # user設定自体は set-true 対象。下で USER_SETTINGS_STATE として扱う
        if real in current_paths:
            current_disabled.append(path)
        else:
            fix_targets.append(path)

    print()

    # --- Windows 側ユーザ走査 (WSL のときのみ) ---
    windows_anchor_fix = []     # set-true 対象 (Windows 側 settings.json)
    windows_targets = []        # remove-key 対象 (Windows 側 settings.local.json)
    if wsl:
        print("走査対象 (Windows 側): /mnt/c/Users/*/.claude (1階層のみ)")
        win_rows = scan_windows_users()
        if not win_rows:
            print("  (対象ユーザなし、または /mnt/c/Users に到達できません)")
        for user, path, state, detail, is_anchor in win_rows:
            line = f"  [{user}][{LABEL[state]}] {path}"
            if is_anchor:
                line += "  <- Windows側 user設定"
            if state == STATE_ERROR and detail:
                line += f" ({detail})"
            print(line)
            if state == STATE_FALSE:
                if is_anchor:
                    windows_anchor_fix.append(path)
                else:
                    windows_targets.append(path)
        print()
    else:
        print("Windows 側の走査: 非WSL環境のためスキップ")
        print()

    # --- サマリ ---
    print("-" * 50)
    print(f"検出ファイル数 (WSL側, managed除く): {len(found)}")

    for label, path in managed_disabled:
        print(f"NOTE: {label} 設定 ({path}) が sandbox を無効化しています。ユーザ設定では修正不可")

    if not deps_ok:
        print(f"NOTE: sandbox 依存パッケージが不足しています ({', '.join(deps_missing)})。"
              "enabled=true でも実際には非sandboxで実行される可能性があります")

    if current_disabled:
        print()
        print("カレントセッション自身の設定が false です (診断/全PC走査のため意図的に無効化された可能性):")
        for p in current_disabled:
            print(f"  - {p}")
        print("NOTE: この項目は自動修正の対象にしません。他の全ファイルの修正が完了した後、")
        print("      ユーザ自身の操作で有効化してもらってください")

    print()
    print(f"USER_SETTINGS_PATH: {USER_SETTINGS_PATH}")
    print(f"USER_SETTINGS_STATE: {user_settings_state}")
    if user_settings_state == STATE_FALSE:
        print(f"USER_SETTINGS_FIX_NEEDED: {USER_SETTINGS_PATH}")

    for p in fix_targets:
        print(f"FIX_TARGET: {p}")
    for p in current_disabled:
        print(f"CURRENT_SESSION_DISABLED: {p}")
    for p in windows_anchor_fix:
        print(f"WINDOWS_USER_SETTINGS_FIX_NEEDED: {p}")
    for p in windows_targets:
        print(f"WINDOWS_TARGET: {p}")
    for label, path in managed_disabled:
        print(f"MANAGED_DISABLED: {label}:{path}")
    if deps_ok:
        print("DEPS_OK")
    else:
        for b in deps_missing:
            print(f"DEPS_MISSING: {b}")

    # current_disabled (カレントセッション自身) は自動修正の対象外のため,
    # 「それ以外に false があるか」を別枠で判定する。ここに含めると
    # ONLY_CURRENT_DISABLED に一生分岐しなくなる
    others_false = bool(
        fix_targets or windows_anchor_fix or windows_targets
        or user_settings_state == STATE_FALSE
    )

    if others_false:
        print("RESULT: DISABLED_FOUND")
        rc = 1
    elif current_disabled:
        print("RESULT: ONLY_CURRENT_DISABLED")
        rc = 1
    else:
        print("RESULT: NO_DISABLED")
        rc = 0

    if _scan_denied_count:
        print(f"WARNING: INCOMPLETE_SCAN {_scan_denied_count}")
        for p in _scan_denied:
            print(f"  denied: {p}")

    return rc


# ---------------------------------------------------------------------------
# --fix: 1ファイルのみ書込 (スキルがユーザ承認後に呼ぶ)
# ---------------------------------------------------------------------------


def fix_file(path, action, dry_run):
    if not os.path.isfile(path):
        print(f"ERROR: ファイルが存在しません: {path}")
        return 2

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
        print(f"ERROR: 読み込みに失敗しました: {path} ({e})")
        return 2

    if not isinstance(data, dict):
        print(f"ERROR: トップレベルが JSON オブジェクトではありません: {path}")
        return 2

    before = None
    sandbox = data.get("sandbox")
    if isinstance(sandbox, dict):
        before = sandbox.get("enabled")

    if action == "set-true":
        if not isinstance(sandbox, dict):
            sandbox = {}
        sandbox["enabled"] = True
        data["sandbox"] = sandbox
        after = True
    elif action == "remove-key":
        if isinstance(sandbox, dict) and "enabled" in sandbox:
            del sandbox["enabled"]
            if sandbox:
                data["sandbox"] = sandbox
            else:
                data.pop("sandbox", None)
        after = None  # 削除後は上位設定を継承 (未設定)
    else:
        print(f"ERROR: 不明な action: {action}")
        return 2

    print(f"対象ファイル   : {path}")
    print(f"変更前 enabled : {before!r}")
    print(f"変更後 enabled : {'(キー削除・上位設定を継承)' if after is None else after!r}")

    if dry_run:
        print("DRY_RUN: ファイルは変更していません")
        return 0

    backup = path + ".bak"
    shutil.copy2(path, backup)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"バックアップ   : {backup}")
    print(f"FIXED: {path}")
    return 1


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--current", action="store_true")
    parser.add_argument("--deps", action="store_true")
    parser.add_argument("--fix", metavar="PATH")
    parser.add_argument("--action", choices=["set-true", "remove-key"])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.fix:
        if not args.action:
            print("ERROR: --fix には --action set-true|remove-key が必須です")
            return 2
        return fix_file(args.fix, args.action, args.dry_run)
    if args.current:
        return check_current()
    if args.deps:
        ok, _missing, _opt = check_deps(print_output=True)
        return 0 if ok else 1
    return scan_all()


if __name__ == "__main__":
    sys.exit(main())
