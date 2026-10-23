import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

const outputStyleState = atom(
  { plugin: "statusline", key: "outputStyle" } as const,
  {},
);

/**
 * 保存済みのoutput style名を読む
 * 描画の中で呼ぶと、syncOutputStyle による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みのoutput style名。設定が無い間は undefined
 */
export async function readOutputStyle($: EngineInterface) {
  const { name } = await read($, outputStyleState);

  return name;
}

/**
 * 設定のoutputStyleを取得し、保存済みの値を更新する
 * 設定が文字列でない場合は、名前の無いオブジェクトを保存する
 * undefined は直接保存できないため、オブジェクトのプロパティとして持つ
 * @param $ engineのインターフェース
 */
export async function syncOutputStyle($: EngineInterface) {
  const outputStyle = await $.settings.read({ key: "outputStyle" });
  await update($, outputStyleState, () => ({
    name: typeof outputStyle === "string" ? outputStyle : undefined,
  }));
}
