// starship参考
// https://github.com/starship/starship/blob/main/src/modules/rust.rs
import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { VERSION_COMMAND_TIMEOUT_MS } from "./commandTimeout";
import type { Entry } from "./directoryEntries";
import { hasExtension, hasFile } from "./directoryEntries";

const rustVersionState = atom(
  { plugin: "statusline", key: "rustVersion" } as const,
  "",
);

const DETECT_FILES = ["Cargo.toml"];
const DETECT_EXTENSIONS = ["rs"];

// 取得の制御に使うだけで描画には使わないため、$.state ではなくモジュールの変数に持つ
let versionCache = { cwd: "", version: "" };

/**
 * ディレクトリの直下の内容が、Rust のプロジェクトかを判定する
 * @param entries ディレクトリの直下の項目
 * @returns Rust のプロジェクトの場合は true
 */
export function isRustProject(entries: readonly Entry[]) {
  return (
    DETECT_FILES.some((name) => hasFile(entries, name)) ||
    DETECT_EXTENSIONS.some((extension) => hasExtension(entries, extension))
  );
}

/**
 * rustc --version の出力から、版を取り出す
 * @param stdout rustc --version の標準出力
 * @returns 版。取り出せない場合は空文字
 */
export function parseRustVersion(stdout: string) {
  return stdout.trim().split(/\s+/)[1] ?? "";
}

/**
 * Rust の版を表示用の文字列に整形する
 * @param version 版
 * @returns 整形後の文字列
 */
export function formatRustVersion(version: string) {
  return `rust:${version}`;
}

/**
 * Rust の版のキャッシュを削除する
 * 次の syncRustVersion では、キャッシュを使わず、rustc を実行して取得する
 */
export function clearRustVersionCache() {
  versionCache = { cwd: "", version: "" };
}

/**
 * 作業ディレクトリで rustc --version を実行し、版を取得する
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @returns 版。終了コードが0でない場合、起動できない場合、タイムアウトの場合は空文字
 */
async function fetchRustVersion($: EngineInterface, cwd: string) {
  try {
    // 未導入のツールチェーンを、版の取得のたびにインストールしないようにする
    const ran = await $.process.run(["rustc", "--version"], {
      cwd,
      timeoutMs: VERSION_COMMAND_TIMEOUT_MS,
      env: { RUSTUP_AUTO_INSTALL: "0" },
    });

    return ran.exitCode === 0 ? parseRustVersion(ran.stdout) : "";
  } catch (error) {
    $.ui.log(`rustc --version failed: ${String(error)}`, { to: "debug" });

    return "";
  }
}

/**
 * 保存済みの Rust の版を読む
 * 描画の中で呼ぶと、syncRustVersion による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの版。Rust のプロジェクトでない間や、取得できない間は空文字
 */
export function readRustVersion($: EngineInterface) {
  return read($, rustVersionState);
}

/**
 * 作業ディレクトリの Rust の版を取得し、保存済みの値を更新する
 * 版は作業ディレクトリごとに1回だけ取得し、プロジェクトでない場合は rustc を実行しない
 * @param $ engineのインターフェース
 */
export async function syncRustVersion($: EngineInterface) {
  const cwd = await $.session.cwd();
  const entries = await $.fs.list(cwd);

  if (!isRustProject(entries)) {
    await update($, rustVersionState, () => "");

    return;
  }

  if (versionCache.cwd !== cwd) {
    versionCache = { cwd, version: await fetchRustVersion($, cwd) };
  }

  await update($, rustVersionState, () => versionCache.version);
}
