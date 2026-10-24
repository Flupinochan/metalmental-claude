import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { countNonEmptyLines, firstLineOf } from "./foldText";

// 用語
// | 日本語         | 意味                                                                   |
// | -------------- | ---------------------------------------------------------------------- |
// | チャット       | 質問1つと、それに対する回答の全体。メインの1ターンに当たる             |
// | 回答のまとまり | チャットの回答のブロックすべて。折りたたみの開閉は、まとまりごと       |
// | 直近           | 最後の2チャットの回答のまとまりと、最後に表示した2件の質問             |
// | 手動の開閉     | ボタンを押して開いた、または閉じた状態。直近かどうかより優先する       |

/**
 * 回答のブロック1つの、折りたたみに必要な情報
 */
export interface FoldBlock {
  id: string;
  lineCount: number;
  firstLine: string;
}

/**
 * 回答のまとまり。ターンが分からないブロックは、そのブロックだけで1つのまとまりにする
 */
export interface FoldGroup {
  key: string;
  blocks: FoldBlock[];
}

const foldOverridesState = atom(
  { plugin: "ui-plus", key: "foldOverrides" } as const,
  {},
);

const RECENT_COUNT = 2;
const MAX_OVERRIDES = 500;

// 直近かどうかは描画時に初めて見た行で判定するため、再読み込み後は表示済みの行をすべて過去として扱う
const groupOfBlock = new Map<string, FoldGroup>();
const seenQuestionIds = new Set<string>();
const recentGroupKeys: string[] = [];
const recentQuestionIds: string[] = [];
let currentTurn: FoldGroup | undefined;

/**
 * 一覧の末尾に追加し、直近の件数を超えた古いものを捨てる
 * @param list 直近のものの一覧
 * @param item 追加するもの
 */
function keepRecent<T>(list: T[], item: T) {
  list.push(item);
  list.splice(0, Math.max(0, list.length - RECENT_COUNT));
}

/**
 * 回答のまとまりを折りたたむかを返す
 * @param group 回答のまとまり
 * @returns まとまり全体で、空でない行が2行以上なら true
 */
export function isGroupFoldable(group: FoldGroup) {
  return group.blocks.reduce((sum, block) => sum + block.lineCount, 0) > 1;
}

/**
 * ブロックが、回答のまとまりの最初のブロックかを返す
 * @param group 回答のまとまり
 * @param blockId 回答のブロックの識別子
 * @returns 最初のブロックなら true
 */
export function isFirstBlock(group: FoldGroup, blockId: string) {
  return group.blocks[0]?.id === blockId;
}

/**
 * 閉じたときに表示する1行目を返す
 * @param group 回答のまとまり
 * @returns 最初のブロックの1行目
 */
export function headingOf(group: FoldGroup) {
  return group.blocks[0]?.firstLine ?? "";
}

/**
 * ターンが始まったことを記録し、折りたたみを描画し直す
 * @param $ engineのインターフェース
 * @param turnId ターンの識別子
 */
export function startAnswerTurn($: EngineInterface, turnId: string) {
  currentTurn = { key: turnId, blocks: [] };
  keepRecent(recentGroupKeys, turnId);
  $.ui.invalidate("ui.render");
}

/**
 * 回答のブロックを、今のターンの回答のまとまりに記録する
 * 初めて見たブロック、またはまとまりを折りたたむかが変わったときは、描画し直す
 * @param $ engineのインターフェース
 * @param blockId 回答のブロックの識別子
 * @param text ブロックの文章
 * @returns ブロックが属する回答のまとまり
 */
export function noteAnswerBlock(
  $: EngineInterface,
  blockId: string,
  text: string,
) {
  const known = groupOfBlock.get(blockId);
  const group = known ?? currentTurn ?? { key: blockId, blocks: [] };
  const wasFoldable = isGroupFoldable(group);
  const info = {
    lineCount: countNonEmptyLines(text),
    firstLine: firstLineOf(text),
  };
  const block = group.blocks.find((one) => one.id === blockId);

  if (block === undefined) {
    group.blocks.push({ id: blockId, ...info });
    groupOfBlock.set(blockId, group);
  } else {
    Object.assign(block, info);
  }

  if (block === undefined || wasFoldable !== isGroupFoldable(group)) {
    $.ui.invalidate("ui.render");
  }

  return group;
}

/**
 * 質問を、直近の質問として記録し、折りたたみを描画し直す
 * 一度見た質問は記録しない
 * @param $ engineのインターフェース
 * @param id 質問の識別子
 */
export function noteQuestionSeen($: EngineInterface, id: string) {
  if (seenQuestionIds.has(id)) {
    return;
  }

  seenQuestionIds.add(id);
  keepRecent(recentQuestionIds, id);
  $.ui.invalidate("ui.render");
}

/**
 * 質問または回答のまとまりを開いて表示するかを返す
 * 手動の開閉があればそれを使い、なければ直近のものだけ開く
 * 描画の中で呼ぶと、toggleOpen による更新時に再描画される
 * @param $ engineのインターフェース
 * @param key 質問の識別子、または回答のまとまりの識別子
 * @returns 開くなら true
 */
export async function isOpen($: EngineInterface, key: string) {
  const overrides = await read($, foldOverridesState);

  return (
    overrides[key] ??
    (recentGroupKeys.includes(key) || recentQuestionIds.includes(key))
  );
}

/**
 * 手動の開閉を保存する。保存は上限の件数までで、古いものから捨てる
 * @param $ engineのインターフェース
 * @param key 質問の識別子、または回答のまとまりの識別子
 * @param wasOpen 押す前に開いていたか
 */
export async function toggleOpen(
  $: EngineInterface,
  key: string,
  wasOpen: boolean,
) {
  await update($, foldOverridesState, (overrides) => {
    const entries: [string, boolean][] = Object.entries(overrides).filter(
      ([name]) => name !== key,
    );

    return Object.fromEntries(
      [...entries, [key, !wasOpen] as [string, boolean]].slice(-MAX_OVERRIDES),
    );
  });
}
