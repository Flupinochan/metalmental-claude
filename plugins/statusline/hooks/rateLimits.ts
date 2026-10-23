import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import type { RateLimit } from "../types";
import { COLOR, levelColor } from "./colors";

const rateLimitsState = atom(
  { plugin: "statusline", key: "rateLimits" } as const,
  [],
);

const RATE_LIMIT_LABELS = [
  { kind: "five_hour", label: "5h" },
  { kind: "seven_day", label: "7d" },
] as const;

const MONTH_INDEX_OFFSET = 1;

/**
 * 数値を2桁にそろえた文字列にする
 * @param value 0以上の整数
 * @returns 2桁の文字列
 */
function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * ISO 8601の日時を、ローカル時刻の時分に整形する
 * @param iso ISO 8601形式の日時
 * @returns 時分の文字列
 */
function clockOf(iso: string) {
  const date = new Date(iso);

  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

/**
 * レート制限のリセット日時を、表示用の文字列に整形する
 * 5hは時分のみ、7dはリセットが数日先になるため日付も付ける
 * @param kind 制限の種類 five_hour または seven_day
 * @param iso リセット日時のISO 8601形式
 * @returns 整形後の文字列
 */
function resetOf(kind: string, iso: string) {
  if (kind === "five_hour") {
    return clockOf(iso);
  }

  const date = new Date(iso);

  return `${twoDigits(date.getMonth() + MONTH_INDEX_OFFSET)}/${twoDigits(date.getDate())} ${clockOf(iso)}`;
}

/**
 * レート制限を、表示用の項目へ変換する
 * @param rateLimits 保存済みのレート制限
 * @returns 項目ごとの kind、表示文字列、色
 */
export function summarizeRateLimits(rateLimits: readonly RateLimit[]) {
  return RATE_LIMIT_LABELS.map(({ kind, label }) => {
    const rateLimit = rateLimits.find((one) => one.kind === kind);

    if (rateLimit === undefined) {
      return { kind, text: `${label}:--`, color: COLOR.blue };
    }

    const reset =
      rateLimit.resetsAt === undefined
        ? ""
        : `(${resetOf(kind, rateLimit.resetsAt)})`;

    return {
      kind,
      text: `${label}:${Math.round(rateLimit.percentUsed)}%${reset}`,
      color: levelColor(rateLimit.percentUsed),
    };
  });
}

/**
 * 保存済みのレート制限を読む
 * 描画の中で呼ぶと、syncRateLimits による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みのレート制限。最初の応答より前や、サブスクリプション以外では空配列
 */
export function readRateLimits($: EngineInterface) {
  return read($, rateLimitsState);
}

/**
 * セッションの現在のレート制限を取得し、保存済みの値を更新する
 * @param $ engineのインターフェース
 */
export async function syncRateLimits($: EngineInterface) {
  const usage = await $.session.usage();
  const rateLimits = usage.rateLimits.map(
    ({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }),
  );
  await update($, rateLimitsState, () => rateLimits);
}
