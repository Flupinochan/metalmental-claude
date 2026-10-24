import type { EngineInterface, RenderSurface, Timer } from "claude-code";
import { atom, read, update } from "claude-code";

import type { CopyResult } from "../types";
import { COLOR } from "./colors";

const copyResultsState = atom(
  { plugin: "ui-plus", key: "copyResults" } as const,
  {},
);

const COPY_RESULT_MS = 3000;
// ボタンの外側の字下げ 2 と、枠線 2 と、折り返さないための余裕 2
const LABEL_WIDTH_OFFSET = 6;
// 行末の通常の空白は描画時に削られるため、削られないノーブレークスペースで埋める
const NO_BREAK_SPACE = " ";

const COPY_LABELS = {
  table: {
    idle: "COPY TABLE",
    success: "TABLE COPIED",
    failed: "COPY FAILED",
  },
  code: {
    idle: "COPY CODE",
    success: "CODE COPIED",
    failed: "COPY FAILED",
  },
} as const;

const COPY_COLORS = {
  idle: { color: COLOR.white, hoverColor: COLOR.indigo },
  success: { color: COLOR.green, hoverColor: COLOR.green },
  failed: { color: COLOR.red, hoverColor: COLOR.red },
} as const;

const resultClearTimers = new Map<string, Timer>();

/**
 * コピー対象の種類とコピーの結果に対応する、ボタンの文言と色を返す
 * @param kind コピー対象の種類 (表またはコード)
 * @param result コピーの結果。まだ押されていない場合は undefined
 * @returns 項目の label と color と hoverColor (ポインタが乗ったときの色)
 */
export function getCopyButtonStyle(
  kind: "table" | "code",
  result: CopyResult | undefined,
) {
  const state = result ?? "idle";

  return { label: COPY_LABELS[kind][state], ...COPY_COLORS[state] };
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
 * 描画の中で呼ぶと、copyText による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns コピー対象の識別子ごとのコピー結果。押されていないものは含まれない
 */
export function readCopyResults($: EngineInterface) {
  return read($, copyResultsState);
}

/**
 * コピー結果を、保存済みの結果から消す
 * @param $ engineのインターフェース
 * @param id コピー対象の識別子
 */
async function clearCopyResult($: EngineInterface, id: string) {
  resultClearTimers.delete(id);
  await update($, copyResultsState, (results) =>
    Object.fromEntries(Object.entries(results).filter(([key]) => key !== id)),
  );
}

/**
 * コピー結果を消すタイマーを取り消す
 * @param id コピー対象の識別子
 */
function cancelCopyResultClear(id: string) {
  resultClearTimers.get(id)?.cancel();
  resultClearTimers.delete(id);
}

/**
 * 一定時間後に、コピー結果を消すタイマーを登録する
 * @param $ engineのインターフェース
 * @param id コピー対象の識別子
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
 * @param id コピー対象の識別子
 * @param result コピーの結果
 */
async function storeCopyResult(
  $: EngineInterface,
  id: string,
  result: CopyResult,
) {
  cancelCopyResultClear(id);
  await update($, copyResultsState, (results) => ({
    ...results,
    [id]: result,
  }));
  scheduleCopyResultClear($, id);
}

/**
 * 文字列をクリップボードへコピーし、結果をボタンに反映する
 * @param $ engineのインターフェース
 * @param id コピー対象の識別子
 * @param textToCopy コピーする文字列 (表の Markdown またはコード)
 * @param surface ボタンが押された描画先
 */
export async function copyText(
  $: EngineInterface,
  id: string,
  textToCopy: string,
  surface: RenderSurface,
) {
  let result: CopyResult = "failed";

  try {
    const copied = await $.ui.copy({ text: textToCopy, surface });

    if (copied.isCopied) {
      result = "success";
    } else {
      $.ui.log(`copy failed: ${copied.reason}`, { to: "debug" });
    }
  } catch (error) {
    $.ui.log(`copy failed: ${String(error)}`, { to: "debug" });
  }

  await storeCopyResult($, id, result);
}
