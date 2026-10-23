// starship参考
// https://github.com/starship/starship/blob/main/src/modules/bun.rs
import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { VERSION_COMMAND_TIMEOUT_MS } from "./commandTimeout";
import type { Entry } from "./directoryEntries";
import { hasFile } from "./directoryEntries";

const bunVersionState = atom(
  { plugin: "statusline", key: "bunVersion" } as const,
  "",
);

const DETECT_FILES = ["bun.lock", "bun.lockb", "bunfig.toml"];

// 取得の制御に使うだけで描画には使わないため、$.state ではなくモジュールの変数に持つ
let versionCache = { cwd: "", version: "" };

/**
 * ディレクトリの直下の内容が、bun のプロジェクトかを判定する
 * @param entries ディレクトリの直下の項目
 * @returns bun のプロジェクトの場合は true
 */
export function isBunProject(entries: readonly Entry[]) {
  return DETECT_FILES.some((name) => hasFile(entries, name));
}

/**
 * bun --version の出力から、版を取り出す
 * @param stdout bun --version の標準出力
 * @returns 版
 */
export function parseBunVersion(stdout: string) {
  return stdout.trim();
}

/**
 * bun の版を表示用の文字列に整形する
 * @param version 版
 * @returns 整形後の文字列
 */
export function formatBunVersion(version: string) {
  return `bun:${version}`;
}

/**
 * bun の版のキャッシュを削除する
 * 次の syncBunVersion では、キャッシュを使わず、bun を実行して取得する
 */
export function clearBunVersionCache() {
  versionCache = { cwd: "", version: "" };
}

/**
 * 作業ディレクトリで bun --version を実行し、版を取得する
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @returns 版。終了コードが0でない場合、起動できない場合、タイムアウトの場合は空文字
 */
async function fetchBunVersion($: EngineInterface, cwd: string) {
  try {
    const ran = await $.process.run(["bun", "--version"], {
      cwd,
      timeoutMs: VERSION_COMMAND_TIMEOUT_MS,
    });

    return ran.exitCode === 0 ? parseBunVersion(ran.stdout) : "";
  } catch (error) {
    $.ui.log(`bun --version failed: ${String(error)}`, { to: "debug" });

    return "";
  }
}

/**
 * 保存済みの bun の版を読む
 * 描画の中で呼ぶと、syncBunVersion による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの版。bun のプロジェクトでない間や、取得できない間は空文字
 */
export function readBunVersion($: EngineInterface) {
  return read($, bunVersionState);
}

/**
 * 作業ディレクトリの bun の版を取得し、保存済みの値を更新する
 * 版は作業ディレクトリごとに1回だけ取得し、プロジェクトでない場合は bun を実行しない
 * @param $ engineのインターフェース
 */
export async function syncBunVersion($: EngineInterface) {
  const cwd = await $.session.cwd();
  const entries = await $.fs.list(cwd);

  if (!isBunProject(entries)) {
    await update($, bunVersionState, () => "");

    return;
  }

  if (versionCache.cwd !== cwd) {
    versionCache = { cwd, version: await fetchBunVersion($, cwd) };
  }

  await update($, bunVersionState, () => versionCache.version);
}
