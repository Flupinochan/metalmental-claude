import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { COLOR } from "./colors";

const reviewedCommandsState = atom(
  { plugin: "statusline", key: "reviewedCommands" } as const,
  [],
);

const REVIEW_COMMANDS = [
  { command: "code-review", label: "review" },
  { command: "simplify", label: "simplify" },
  { command: "security-review", label: "security" },
] as const;

/**
 * ボタンの押下を処理する
 * 入力欄にコマンドを流し込み、入った場合のみ実行済みとして記録する
 * @param $ engineのインターフェース
 * @param command 押されたボタンのコマンド名
 */
export async function pressReview($: EngineInterface, command: string) {
  const filled = await $.prompt.fill({ text: `/${command}`, mode: "replace" });

  if (!filled.isFilled) {
    $.ui.log(
      `prompt fill failed: /${command} (${filled.refusal ?? "unknown"})`,
      { to: "debug" },
    );

    return;
  }

  await update($, reviewedCommandsState, (reviewedCommands) => [
    ...new Set([...reviewedCommands, command]),
  ]);
}

/**
 * 実行済みのコマンドを読む
 * 描画の中で呼ぶと、pressReview による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 実行済みのコマンド名。セッション中のみ保持し、無い場合は空配列
 */
export function readReviewedCommands($: EngineInterface) {
  return read($, reviewedCommandsState);
}

/**
 * ボタンごとの表示用の項目を、定義順に作る
 * 実行済みは green、未実行は red
 * @param reviewedCommands 実行済みのコマンド名
 * @returns 項目ごとの command、label、color
 */
export function summarizeReviews(reviewedCommands: readonly string[]) {
  return REVIEW_COMMANDS.map(({ command, label }) => ({
    command,
    label,
    color: reviewedCommands.includes(command) ? COLOR.green : COLOR.orange,
  }));
}
