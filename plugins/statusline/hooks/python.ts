// starship参考
// https://github.com/starship/starship/blob/main/src/modules/python.rs
import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { VERSION_COMMAND_TIMEOUT_MS } from "./commandTimeout";
import type { Entry } from "./directoryEntries";
import { hasExtension, hasFile } from "./directoryEntries";

const pythonVersionState = atom(
  { plugin: "statusline", key: "pythonVersion" } as const,
  "",
);

const PYTHON_COMMANDS = ["python", "python3", "python2"];
const DETECT_FILES = [
  "requirements.txt",
  ".python-version",
  "pyproject.toml",
  "Pipfile",
  "tox.ini",
  "setup.py",
  "__init__.py",
];
const DETECT_EXTENSIONS = ["py", "ipynb"];

// 取得の制御に使うだけで描画には使わないため、$.state ではなくモジュールの変数に持つ
let versionCache = { cwd: "", version: "" };

/**
 * ディレクトリの直下の内容と環境変数が、Python のプロジェクトかを判定する
 * 仮想環境の環境変数が設定されていれば、ファイルがなくてもプロジェクトとして扱う
 * @param entries ディレクトリの直下の項目
 * @param virtualEnv 環境変数 VIRTUAL_ENV の値。設定されていない場合は undefined
 * @returns Python のプロジェクトの場合は true
 */
export function isPythonProject(
  entries: readonly Entry[],
  virtualEnv: string | undefined,
) {
  return (
    virtualEnv !== undefined ||
    DETECT_FILES.some((name) => hasFile(entries, name)) ||
    DETECT_EXTENSIONS.some((extension) => hasExtension(entries, extension))
  );
}

/**
 * python --version の出力から、版を取り出す
 * @param output python --version の出力
 * @returns 版。取り出せない場合は空文字
 */
export function parsePythonVersion(output: string) {
  return output.trim().split(/\s+/)[1] ?? "";
}

/**
 * Python の版を表示用の文字列に整形する
 * @param version 版
 * @returns 整形後の文字列
 */
export function formatPythonVersion(version: string) {
  return `python:${version}`;
}

/**
 * Python の版のキャッシュを削除する
 * 次の syncPythonVersion では、キャッシュを使わず、python を実行して取得する
 */
export function clearPythonVersionCache() {
  versionCache = { cwd: "", version: "" };
}

/**
 * 作業ディレクトリで --version を実行し、最初に成功したコマンドの版を取得する
 * python2 は版を標準エラー出力に書くため、標準出力が空なら標準エラー出力を使う
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @returns 版。すべての候補が失敗した場合は空文字
 */
async function fetchPythonVersion($: EngineInterface, cwd: string) {
  for (const command of PYTHON_COMMANDS) {
    try {
      const ran = await $.process.run([command, "--version"], {
        cwd,
        timeoutMs: VERSION_COMMAND_TIMEOUT_MS,
      });

      if (ran.exitCode === 0) {
        return parsePythonVersion(
          ran.stdout.trim() === "" ? ran.stderr : ran.stdout,
        );
      }
    } catch (error) {
      $.ui.log(`${command} --version failed: ${String(error)}`, {
        to: "debug",
      });
    }
  }

  return "";
}

/**
 * 保存済みの Python の版を読む
 * 描画の中で呼ぶと、syncPythonVersion による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの版。Python のプロジェクトでない間や、取得できない間は空文字
 */
export function readPythonVersion($: EngineInterface) {
  return read($, pythonVersionState);
}

/**
 * 作業ディレクトリの Python の版を取得し、保存済みの値を更新する
 * 版は作業ディレクトリごとに1回だけ取得し、プロジェクトでない場合は python を実行しない
 * @param $ engineのインターフェース
 */
export async function syncPythonVersion($: EngineInterface) {
  const cwd = await $.session.cwd();
  const [entries, virtualEnv] = await Promise.all([
    $.fs.list(cwd),
    $.env.get("VIRTUAL_ENV"),
  ]);

  if (!isPythonProject(entries, virtualEnv)) {
    await update($, pythonVersionState, () => "");

    return;
  }

  if (versionCache.cwd !== cwd) {
    versionCache = { cwd, version: await fetchPythonVersion($, cwd) };
  }

  await update($, pythonVersionState, () => versionCache.version);
}
