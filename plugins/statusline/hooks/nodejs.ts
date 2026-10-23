// starship参考
// https://github.com/starship/starship/blob/main/src/modules/nodejs.rs
import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { VERSION_COMMAND_TIMEOUT_MS } from "./commandTimeout";
import type { Entry } from "./directoryEntries";
import { hasExtension, hasFile, hasFolder } from "./directoryEntries";

const nodeVersionState = atom(
  { plugin: "statusline", key: "nodeVersion" } as const,
  "",
);

const DETECT_FILES = ["package.json", ".node-version", ".nvmrc"];
const DETECT_FOLDERS = ["node_modules"];
const DETECT_EXTENSIONS = ["js", "mjs", "cjs", "ts", "mts", "cts"];
const EXCLUDE_FILES = [
  "bunfig.toml",
  "bun.lock",
  "bun.lockb",
  "deno.json",
  "deno.jsonc",
  "deno.lock",
];
const EXCLUDE_FOLDERS = ["esy.lock"];

// 取得の制御に使うだけで描画には使わないため、$.state ではなくモジュールの変数に持つ
let versionCache = { cwd: "", version: "" };

/**
 * ディレクトリの直下の内容が、Node.js のプロジェクトかを判定する
 * 除外の対象があれば、他の条件によらずプロジェクトではない
 * @param entries ディレクトリの直下の項目
 * @returns Node.js のプロジェクトの場合は true
 */
export function isNodeProject(entries: readonly Entry[]) {
  const file = (name: string) => hasFile(entries, name);
  const folder = (name: string) => hasFolder(entries, name);
  const extension = (name: string) => hasExtension(entries, name);

  if (EXCLUDE_FILES.some(file) || EXCLUDE_FOLDERS.some(folder)) {
    return false;
  }

  return (
    DETECT_FILES.some(file) ||
    DETECT_FOLDERS.some(folder) ||
    DETECT_EXTENSIONS.some(extension)
  );
}

/**
 * node --version の出力から、先頭の v と空白を除いた版を取り出す
 * @param stdout node --version の標準出力
 * @returns 版
 */
export function parseNodeVersion(stdout: string) {
  return stdout.trim().replace(/^v/, "");
}

/**
 * Node.js の版を表示用の文字列に整形する
 * @param version 版
 * @returns 整形後の文字列
 */
export function formatNodeVersion(version: string) {
  return `node:${version}`;
}

/**
 * Node.js の版のキャッシュを削除する
 * 次の syncNodeVersion では、キャッシュを使わず、node を実行して取得する
 */
export function clearNodeVersionCache() {
  versionCache = { cwd: "", version: "" };
}

/**
 * 作業ディレクトリで node --version を実行し、版を取得する
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @returns 版。終了コードが0でない場合、起動できない場合、タイムアウトの場合は空文字
 */
async function fetchNodeVersion($: EngineInterface, cwd: string) {
  try {
    const ran = await $.process.run(["node", "--version"], {
      cwd,
      timeoutMs: VERSION_COMMAND_TIMEOUT_MS,
    });

    return ran.exitCode === 0 ? parseNodeVersion(ran.stdout) : "";
  } catch (error) {
    $.ui.log(`node --version failed: ${String(error)}`, { to: "debug" });

    return "";
  }
}

/**
 * 保存済みの Node.js の版を読む
 * 描画の中で呼ぶと、syncNodeVersion による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの版。Node.js のプロジェクトでない間や、取得できない間は空文字
 */
export function readNodeVersion($: EngineInterface) {
  return read($, nodeVersionState);
}

/**
 * 作業ディレクトリの Node.js の版を取得し、保存済みの値を更新する
 * 版は作業ディレクトリごとに1回だけ取得し、プロジェクトでない場合は node を実行しない
 * @param $ engineのインターフェース
 */
export async function syncNodeVersion($: EngineInterface) {
  const cwd = await $.session.cwd();
  const entries = await $.fs.list(cwd);

  if (!isNodeProject(entries)) {
    await update($, nodeVersionState, () => "");

    return;
  }

  if (versionCache.cwd !== cwd) {
    versionCache = { cwd, version: await fetchNodeVersion($, cwd) };
  }

  await update($, nodeVersionState, () => versionCache.version);
}
