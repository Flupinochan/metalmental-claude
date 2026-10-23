import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import type { ReloadStatus } from "../types";
import { clearCaches } from "./clearCaches";
import { COLOR } from "./colors";
import { syncStatusline } from "./syncStatusline";

const reloadStatusState = atom(
  { plugin: "statusline", key: "reloadStatus" } as const,
  "idle",
);

const RELOAD_DONE_MS = 3000;

const RELOAD_INDICATORS = {
  idle: { icon: "↻", color: COLOR.blue },
  loading: { icon: "…", color: COLOR.yellow },
  done: { icon: "✓", color: COLOR.green },
} as const satisfies Record<
  ReloadStatus,
  { readonly icon: string; readonly color: string }
>;

/**
 * リロードの状態に対応する、ボタンのアイコンと色を返す
 * idle は ↻ の blue、loading は … の yellow、done は ✓ の green
 * @param status リロードの状態
 * @returns 項目の icon と color
 */
export function summarizeReload(status: ReloadStatus) {
  return RELOAD_INDICATORS[status];
}

/**
 * 保存済みのリロードの状態を読む
 * 描画の中で呼ぶと、reloadManually による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みのリロードの状態。初期値は idle
 */
export function readReloadStatus($: EngineInterface) {
  return read($, reloadStatusState);
}

/**
 * ボタンの押下による手動リロードを実行する
 * キャッシュを削除してから更新する。実行中の押下は無視し、完了後は3秒間 done を表示して idle に戻す
 * @param $ engineのインターフェース
 */
export async function reloadManually($: EngineInterface) {
  let isStarted = false;
  await update($, reloadStatusState, (status): ReloadStatus => {
    isStarted = status !== "loading";

    return "loading";
  });

  if (!isStarted) {
    return;
  }

  clearCaches();

  try {
    await syncStatusline($);
  } catch (error) {
    $.ui.log(`reload failed: ${String(error)}`, { to: "debug" });
  } finally {
    await update($, reloadStatusState, () => "done");
    // 完了の表示を一定時間後に戻すため、結果を待たずにタイマーで更新する
    $.clock.after(RELOAD_DONE_MS, () =>
      update($, reloadStatusState, (status) =>
        status === "done" ? "idle" : status,
      ),
    );
  }
}
