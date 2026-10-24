import type { EngineInterface, RenderSurface, Timer } from "claude-code";
import { atom, read, update } from "claude-code";

import type { TableCopyResult } from "../types";
import { COLOR } from "./colors";

const copyResultsState = atom(
  { plugin: "ui-plus", key: "tableCopyResults" } as const,
  {},
);

const COPY_RESULT_MS = 3000;
// ボタンの外側の字下げ 2 と、枠線 2 と、折り返さないための余裕 2
const LABEL_WIDTH_OFFSET = 6;
// 行末の通常の空白は描画時に削られるため、削られないノーブレークスペースで埋める
const NO_BREAK_SPACE = "\u00a0";

const COPY_BUTTON_STYLES = {
  idle: { label: "COPY TABLE", color: COLOR.white, hoverColor: COLOR.indigo },
  success: {
    label: "TABLE COPIED",
    color: COLOR.green,
    hoverColor: COLOR.green,
  },
  failed: { label: "COPY FAILED", color: COLOR.red, hoverColor: COLOR.red },
} as const satisfies Record<
  "idle" | TableCopyResult,
  {
    readonly label: string;
    readonly color: string;
    readonly hoverColor: string;
  }
>;

const resultClearTimers = new Map<string, Timer>();

/**
 * コピーの結果に対応する、ボタンの文言と色を返す
 * @param result コピーの結果。まだ押されていない場合は undefined
 * @returns 項目の label と color と hoverColor (ポインタが乗ったときの色)
 */
export function getCopyButtonStyle(result: TableCopyResult | undefined) {
  return COPY_BUTTON_STYLES[result ?? "idle"];
}

/**
 * 文言を中央に置き、端末の横幅いっぱいになるまで両側を埋める
 * 横幅が分からない場合は、文言をそのまま返す
 * @param label ボタンの文言
 * @param columns 端末の桁数。分からない場合は undefined
 * @returns 横幅いっぱいにした文言
 */
export function padLabelToWidth(label: string, columns: number | undefined) {
  if (columns === undefined) {
    return label;
  }

  const width = Math.max(label.length, columns - LABEL_WIDTH_OFFSET);
  const left = Math.floor((width - label.length) / 2);

  return (
    NO_BREAK_SPACE.repeat(left) +
    label +
    NO_BREAK_SPACE.repeat(width - label.length - left)
  );
}

/**
 * 保存済みのコピー結果を読む
 * 描画の中で呼ぶと、copyTable による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 表の識別子ごとのコピー結果。押されていない表は含まれない
 */
export function readCopyResults($: EngineInterface) {
  return read($, copyResultsState);
}

/**
 * 表のコピー結果を、保存済みの結果から消す
 * @param $ engineのインターフェース
 * @param id 表の識別子
 */
async function clearCopyResult($: EngineInterface, id: string) {
  resultClearTimers.delete(id);
  await update($, copyResultsState, (results) =>
    Object.fromEntries(Object.entries(results).filter(([key]) => key !== id)),
  );
}

/**
 * 表のコピー結果を消すタイマーを取り消す
 * @param id 表の識別子
 */
function cancelCopyResultClear(id: string) {
  resultClearTimers.get(id)?.cancel();
  resultClearTimers.delete(id);
}

/**
 * 一定時間後に、表のコピー結果を消すタイマーを登録する
 * @param $ engineのインターフェース
 * @param id 表の識別子
 */
function scheduleCopyResultClear($: EngineInterface, id: string) {
  resultClearTimers.set(
    id,
    $.clock.after(COPY_RESULT_MS, () => clearCopyResult($, id)),
  );
}

/**
 * コピー結果を保存し、一定時間後に消す
 * @param $ engineのインターフェース
 * @param id 表の識別子
 * @param result コピーの結果
 */
async function syncCopyResult(
  $: EngineInterface,
  id: string,
  result: TableCopyResult,
) {
  cancelCopyResultClear(id);
  await update($, copyResultsState, (results) => ({
    ...results,
    [id]: result,
  }));
  // 結果の表示を一定時間後に戻すため、結果を待たずにタイマーで更新する
  scheduleCopyResultClear($, id);
}

/**
 * 表の Markdown をクリップボードへコピーし、結果をボタンに反映する
 * @param $ engineのインターフェース
 * @param id 表の識別子
 * @param tableText コピーする表の Markdown
 * @param surface ボタンが押された描画先
 */
export async function copyTable(
  $: EngineInterface,
  id: string,
  tableText: string,
  surface: RenderSurface,
) {
  let result: TableCopyResult = "failed";

  try {
    const copied = await $.ui.copy({ text: tableText, surface });

    if (copied.isCopied) {
      result = "success";
    } else {
      $.ui.log(`copy failed: ${copied.reason}`, { to: "debug" });
    }
  } catch (error) {
    $.ui.log(`copy failed: ${String(error)}`, { to: "debug" });
  }

  await syncCopyResult($, id, result);
}
