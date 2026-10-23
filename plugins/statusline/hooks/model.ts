import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { COLOR } from "./colors";

const modelIdState = atom(
  { plugin: "statusline", key: "modelId" } as const,
  "",
);

const MODEL_COLORS: readonly (readonly [RegExp, string])[] = [
  [/sonnet/i, COLOR.green],
  [/opus/i, COLOR.yellow],
  [/fable/i, COLOR.red],
];

/**
 * モデルIDを表示用の短い文字列に整形する
 * 表示名を返すAPIが無いため、IDから組み立てる
 * @param modelId モデルID 例: claude-opus-5-5[1m]
 * @returns 整形後の文字列 例: opus5.5
 */
export function formatModel(modelId: string) {
  return modelId
    .replace(/^claude-/, "")
    .replace(/\[[^[\]]*\]$/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-(\d+)-(\d+)$/, "$1.$2")
    .replace(/-(\d+)$/, "$1");
}

/**
 * モデルIDに対応する色を返す
 * 該当するモデルが無い場合は blue を返す
 * @param modelId モデルID
 * @returns テーマキーで表した色
 */
export function modelColor(modelId: string) {
  return (
    MODEL_COLORS.find(([pattern]) => pattern.test(modelId))?.[1] ?? COLOR.blue
  );
}

/**
 * 保存済みのモデルIDを読む
 * 描画の中で呼ぶと、syncModelId による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みのモデルID。未取得の間は空文字
 */
export function readModelId($: EngineInterface) {
  return read($, modelIdState);
}

/**
 * セッションの現在のモデルIDを取得し、保存済みの値を更新する
 * @param $ engineのインターフェース
 */
export async function syncModelId($: EngineInterface) {
  const modelId = await $.session.model();
  await update($, modelIdState, () => modelId);
}
