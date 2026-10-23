import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { COLOR, levelColor } from "./colors";

const ctxState = atom({ plugin: "statusline", key: "ctx" } as const, {});

/**
 * ctx使用率を表示用の文字列に整形する
 * @param percent ctx使用率 0から100。無い場合は undefined
 * @returns 整形後の文字列
 */
export function formatCtx(percent: number | undefined) {
  return percent === undefined ? "ctx:--" : `ctx:${Math.round(percent)}%`;
}

/**
 * ctx使用率に対応する色を返す
 * @param percent ctx使用率 0から100。無い場合は undefined
 * @returns テーマキーで表した色
 */
export function ctxColor(percent: number | undefined) {
  return percent === undefined ? COLOR.blue : levelColor(percent);
}

/**
 * 保存済みのctx使用率を読む
 * 描画の中で呼ぶと、syncCtx による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの使用率。最初の応答より前は undefined
 */
export async function readCtx($: EngineInterface) {
  const { percent } = await read($, ctxState);

  return percent;
}

/**
 * セッションの現在のctx使用率を取得し、保存済みの値を更新する
 * 最初の応答より前や compact 直後は使用率が無いため、使用率の無いオブジェクトを保存する
 * undefined は直接保存できないため、オブジェクトのプロパティとして持つ
 * @param $ engineのインターフェース
 */
export async function syncCtx($: EngineInterface) {
  const usage = await $.session.usage();
  await update($, ctxState, () => ({ percent: usage.context.percent }));
}
