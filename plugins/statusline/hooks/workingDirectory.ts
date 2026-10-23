import type { EngineInterface, RenderSurface } from "claude-code";
import { atom, read, update } from "claude-code";

import { COLOR } from "./colors";

const workingDirectoryState = atom(
  { plugin: "statusline", key: "workingDirectory" } as const,
  "",
);

const WORKTREE_KEYWORD = "worktree";

/**
 * 絶対パスの末尾のディレクトリ名を取り出す
 * @param path 絶対パス
 * @returns ディレクトリ名
 */
export function directoryName(path: string) {
  return path.split("/").findLast((segment) => segment !== "") ?? "/";
}

/**
 * 作業ディレクトリに対応する色を返す
 * @param path 絶対パス
 * @returns テーマキーで表した色
 */
export function workingDirectoryColor(path: string) {
  return path.includes(WORKTREE_KEYWORD) ? COLOR.blue : COLOR.yellow;
}

/**
 * 作業ディレクトリの絶対パスをクリップボードへコピーする
 * @param $ engineのインターフェース
 * @param path コピーする絶対パス
 * @param surface ボタンが押された描画先
 */
export async function copyWorkingDirectory(
  $: EngineInterface,
  path: string,
  surface: RenderSurface,
) {
  const copied = await $.ui.copy({ text: path, surface });

  if (!copied.isCopied) {
    $.ui.log(`copy failed: ${copied.reason}`, { to: "debug" });
  }
}

/**
 * 保存済みの作業ディレクトリを読む
 * 描画の中で呼ぶと、syncWorkingDirectory による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの絶対パス。未取得の間は空文字
 */
export function readWorkingDirectory($: EngineInterface) {
  return read($, workingDirectoryState);
}

/**
 * セッションの現在の作業ディレクトリを取得し、保存済みの値を更新する
 * @param $ engineのインターフェース
 */
export async function syncWorkingDirectory($: EngineInterface) {
  const workingDirectory = await $.session.cwd();
  await update($, workingDirectoryState, () => workingDirectory);
}
