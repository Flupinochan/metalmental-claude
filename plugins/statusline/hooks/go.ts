// starship参考
// https://github.com/starship/starship/blob/main/src/modules/golang.rs
import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { VERSION_COMMAND_TIMEOUT_MS } from "./commandTimeout";
import type { Entry } from "./directoryEntries";
import { hasExtension, hasFile, hasFolder } from "./directoryEntries";

const goVersionState = atom(
  { plugin: "statusline", key: "goVersion" } as const,
  "",
);

const DETECT_FILES = [
  "go.mod",
  "go.sum",
  "go.work",
  "glide.yaml",
  "Gopkg.yml",
  "Gopkg.lock",
  ".go-version",
];
const DETECT_FOLDERS = ["Godeps"];
const DETECT_EXTENSIONS = ["go"];

// 取得の制御に使うだけで描画には使わないため、$.state ではなくモジュールの変数に持つ
let versionCache = { cwd: "", version: "" };

/**
 * ディレクトリの直下の内容が、Go のプロジェクトかを判定する
 * @param entries ディレクトリの直下の項目
 * @returns Go のプロジェクトの場合は true
 */
export function isGoProject(entries: readonly Entry[]) {
  return (
    DETECT_FILES.some((name) => hasFile(entries, name)) ||
    DETECT_FOLDERS.some((name) => hasFolder(entries, name)) ||
    DETECT_EXTENSIONS.some((extension) => hasExtension(entries, extension))
  );
}

/**
 * go version の出力から、版を取り出す
 * @param stdout go version の標準出力 例: go version go1.25.0 linux/amd64
 * @returns 版。取り出せない場合は空文字
 */
export function parseGoVersion(stdout: string) {
  return /^go version go(\S+)/.exec(stdout.trim())?.[1] ?? "";
}

/**
 * Go の版を表示用の文字列に整形する
 * @param version 版
 * @returns 整形後の文字列
 */
export function formatGoVersion(version: string) {
  return `go:${version}`;
}

/**
 * Go の版のキャッシュを削除する
 * 次の syncGoVersion では、キャッシュを使わず、go を実行して取得する
 */
export function clearGoVersionCache() {
  versionCache = { cwd: "", version: "" };
}

/**
 * 作業ディレクトリで go version を実行し、版を取得する
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @returns 版。終了コードが0でない場合、起動できない場合、タイムアウトの場合は空文字
 */
async function fetchGoVersion($: EngineInterface, cwd: string) {
  try {
    // go.mod が指す新しい版を、版の取得のたびにダウンロードしないようにする
    const ran = await $.process.run(["go", "version"], {
      cwd,
      timeoutMs: VERSION_COMMAND_TIMEOUT_MS,
      env: { GOTOOLCHAIN: "local" },
    });

    return ran.exitCode === 0 ? parseGoVersion(ran.stdout) : "";
  } catch (error) {
    $.ui.log(`go version failed: ${String(error)}`, { to: "debug" });

    return "";
  }
}

/**
 * 保存済みの Go の版を読む
 * 描画の中で呼ぶと、syncGoVersion による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの版。Go のプロジェクトでない間や、取得できない間は空文字
 */
export function readGoVersion($: EngineInterface) {
  return read($, goVersionState);
}

/**
 * 作業ディレクトリの Go の版を取得し、保存済みの値を更新する
 * 版は作業ディレクトリごとに1回だけ取得し、プロジェクトでない場合は go を実行しない
 * @param $ engineのインターフェース
 */
export async function syncGoVersion($: EngineInterface) {
  const cwd = await $.session.cwd();
  const entries = await $.fs.list(cwd);

  if (!isGoProject(entries)) {
    await update($, goVersionState, () => "");

    return;
  }

  if (versionCache.cwd !== cwd) {
    versionCache = { cwd, version: await fetchGoVersion($, cwd) };
  }

  await update($, goVersionState, () => versionCache.version);
}
