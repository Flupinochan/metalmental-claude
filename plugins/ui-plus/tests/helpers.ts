import type { On } from "claude-code";
import type { Engine, MockClock } from "claude-code/testing";
import { mock } from "claude-code/testing";

export const TABLE = "| 名前 | 値 |\n| --- | --- |\n| a | 1 |\n| b | 2 |";

export const COLUMNS = 80;

/**
 * stub が返す、テストごとに書き換えられる世界の状態
 */
export interface State {
  copy:
    | { isCopied: true }
    | { isCopied: false; reason: "no-surface" | "no-clipboard" | "refused" };
  copyFails: boolean;
}

/**
 * stub が受けた呼び出しの記録
 */
export interface Calls {
  copies: { text: string; surface: string }[];
  logs: string[];
}

/**
 * Claude Code の代わりに答える stub をすべて登録する
 * @param on stub を登録する関数
 * @param overrides 既定の状態から変える項目
 * @returns 状態、呼び出しの記録、時計
 */
export function stubWorld(on: On, overrides: Partial<State> = {}) {
  const state: State = {
    copy: { isCopied: true },
    copyFails: false,
    ...overrides,
  };
  const calls: Calls = { copies: [], logs: [] };
  const clock: MockClock = mock.clock(on);

  on("ui.copy", (_, e) => {
    calls.copies.push({ text: e.text, surface: e.surface ?? "" });

    return state.copyFails
      ? { deny: "clipboard failed" }
      : { value: state.copy };
  });
  on("ui.log", (_, e) => {
    calls.logs.push(e.text);

    return { value: undefined };
  });
  on("ui.render", () => ({
    type: "Text",
    props: {},
    children: ["標準の表示"],
  }));

  return { state, calls, clock };
}

/**
 * 回答を描画する対象を作る
 * @param text 回答の Markdown
 * @param props 既定の props から変える項目
 * @param props.isFirstOfReply 返信の最初の回答か
 * @param props.isSummary 要約の回答か
 * @returns ui.mount に渡す対象
 */
export function reply(
  text: string,
  props: { isFirstOfReply?: boolean; isSummary?: true } = {},
) {
  return {
    plugin: "ui-plus",
    component: "AssistantMessage",
    requestId: "reply-1",
    props: { text, isFirstOfReply: true, ...props },
    surface: "terminal",
    viewport: { columns: COLUMNS, rows: 24, isFullscreen: false },
  } as const;
}

/**
 * 世界を用意して、回答を描画する
 * @param $ テストキットのエンジン
 * @param on stub を登録する関数
 * @param text 回答の Markdown
 * @param overrides 既定の状態から変える項目
 * @returns 描画のハンドル、状態、呼び出しの記録、時計
 */
export async function mountReply(
  $: Engine,
  on: On,
  text: string,
  overrides: Partial<State> = {},
) {
  const world = stubWorld(on, overrides);
  const ui = await $.ui.mount(reply(text));

  return { ui, ...world };
}
