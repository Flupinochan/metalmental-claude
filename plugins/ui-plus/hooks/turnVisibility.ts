import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import type { TurnState } from "../types";

// 用語
// | 日本語             | 英語        | 意味                                                         |
// | ------------------ | ----------- | ------------------------------------------------------------ |
// | 回答中             | isRunning   | メインの回答の開始から終了までの間                           |
// | 回答の終了後       | hasEnded    | 1回以上、メインの回答が終わっている状態                      |
// | 今の回答のツール   | toolUseIds  | 回答中に呼ばれたツールの識別子。サブエージェントの呼び出しも含む |
// | サブエージェントの行 | -           | 他のエージェントからのメッセージと、バックグラウンドタスクの通知 |

// 描画の識別子で覚える。終わった回答までに描画した行は、次の回答中も表示に戻さない
const seenAgentRowIds = new Set<string>();
const endedAgentRowIds = new Set<string>();

const turnState = atom({ plugin: "ui-plus", key: "turn" } as const, {
  isRunning: false,
  hasEnded: false,
  toolUseIds: [],
});

/**
 * 保存済みの回答の状態を読む
 * 描画の中で呼ぶと、回答の開始、ツールの呼び出し、回答の終了による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 回答の状態
 */
export function readTurnState($: EngineInterface) {
  return read($, turnState);
}

/**
 * 回答の開始を保存する。前の回答のツールは忘れる
 * @param $ engineのインターフェース
 */
export async function startTurn($: EngineInterface) {
  await update($, turnState, (turn) => ({
    ...turn,
    isRunning: true,
    toolUseIds: [],
  }));
}

/**
 * 今の回答で呼ばれたツールを保存する
 * @param $ engineのインターフェース
 * @param toolUseId ツール呼び出しの識別子
 */
export async function recordToolCall($: EngineInterface, toolUseId: string) {
  await update($, turnState, (turn) => ({
    ...turn,
    toolUseIds: [...turn.toolUseIds, toolUseId],
  }));
}

/**
 * 回答の終了を保存する。今の回答のツールは忘れる
 * @param $ engineのインターフェース
 */
export async function endTurn($: EngineInterface) {
  for (const id of seenAgentRowIds) {
    endedAgentRowIds.add(id);
  }

  await update($, turnState, () => ({
    isRunning: false,
    hasEnded: true,
    toolUseIds: [],
  }));
}

/**
 * ツールの行を、今の回答のものとして表示するかを返す
 * @param turn 回答の状態
 * @param toolUseId ツール呼び出しの識別子
 * @returns 今の回答のツールなら true
 */
export function isToolShown(turn: TurnState, toolUseId: string) {
  return turn.toolUseIds.includes(toolUseId);
}

/**
 * ツールのまとめの行を、今の回答のものとして表示するかを返す
 * @param turn 回答の状態
 * @param calls まとめに含まれるツール呼び出し
 * @returns 1つでも今の回答のツールがあれば true
 */
export function isToolGroupShown(
  turn: TurnState,
  calls: readonly { tool_use_id?: string }[],
) {
  return calls.some(
    (call) =>
      call.tool_use_id !== undefined && isToolShown(turn, call.tool_use_id),
  );
}

/**
 * サブエージェントの行を、今の回答のものとして表示するかを返す
 * 回答が始まる前に描画した行も、その回答が始まれば表示する
 * @param turn 回答の状態
 * @param rowId 描画する行の識別子
 * @returns 回答中で、前の回答までに描画していない行なら true
 */
export function isAgentRowShown(turn: TurnState, rowId: string) {
  seenAgentRowIds.add(rowId);

  return turn.isRunning && !endedAgentRowIds.has(rowId);
}

/**
 * 起動時のお知らせを表示するかを返す
 * @param turn 回答の状態
 * @returns 最初の回答が終わるまで、または回答中なら true
 */
export function isInfoNoticeShown(turn: TurnState) {
  return !turn.hasEnded || turn.isRunning;
}
