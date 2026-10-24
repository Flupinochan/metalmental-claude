import type { On } from "claude-code";
import type { Engine, MockClock } from "claude-code/testing";
import { mock } from "claude-code/testing";

export const TABLE = "| 名前 | 値 |\n| --- | --- |\n| a | 1 |\n| b | 2 |";

export const CODE = "git status\ngit diff";

export const CODE_BLOCK = `\`\`\`bash\n${CODE}\n\`\`\``;

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
  toolUseIds: string[];
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
  const calls: Calls = { copies: [], logs: [], toolUseIds: [] };
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
  on("turn.start", (_, e) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));
  on("tool.call", (_, e) => {
    calls.toolUseIds.push(e.tool_use_id);

    return { result: {} };
  });
  on("ui.render", () => ({
    type: "Text",
    props: {},
    children: ["標準の表示"],
  }));

  return { state, calls, clock };
}

let requestCount = 0;

/**
 * 他のテストと重ならない、描画する行の識別子を作る
 * @param prefix 識別子の先頭
 * @returns 識別子
 */
export function nextRequestId(prefix: string) {
  requestCount += 1;

  return `${prefix}-${requestCount}`;
}

/**
 * 回答を描画する対象を作る
 * @param text 回答の Markdown
 * @param props 既定の props から変える項目
 * @param props.isFirstOfReply 返信の最初の回答か
 * @param props.isSummary 要約の回答か
 * @param requestId 回答の識別子。省略すると、他のテストと重ならない識別子にする
 * @returns ui.mount に渡す対象
 */
export function reply(
  text: string,
  props: { isFirstOfReply?: boolean; isSummary?: true } = {},
  requestId = nextRequestId("reply"),
) {
  return {
    plugin: "ui-plus",
    component: "AssistantMessage",
    requestId,
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
  await startTurn($, nextRequestId("turn"));
  const ui = await $.ui.mount(reply(text));

  return { ui, ...world };
}

const VIEWPORT = { columns: COLUMNS, rows: 24, isFullscreen: false } as const;

/**
 * ツール呼び出しの行を描画する対象を作る
 * @param toolUseId ツール呼び出しの識別子
 * @param isExpanded 全体表示か
 * @returns ui.mount に渡す対象
 */
export function toolUseRow(toolUseId: string, isExpanded = false) {
  return {
    plugin: "ui-plus",
    component: "ToolUse",
    requestId: toolUseId,
    props: {
      tool_use_id: toolUseId,
      tool: "Read",
      input: {},
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      isExpanded,
    },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}

/**
 * ツールの結果の行を描画する対象を作る
 * @param toolUseId ツール呼び出しの識別子
 * @returns ui.mount に渡す対象
 */
export function toolResultRow(toolUseId: string) {
  return {
    plugin: "ui-plus",
    component: "ToolResult",
    requestId: toolUseId,
    props: {
      tool_use_id: toolUseId,
      tool: "Read",
      output: {},
      isErrored: false,
    },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}

/**
 * ツールのまとめの行を描画する対象を作る
 * @param toolUseIds まとめに含めるツール呼び出しの識別子
 * @param requestId 行の識別子
 * @returns ui.mount に渡す対象
 */
export function toolGroupRow(
  toolUseIds: readonly string[],
  requestId = "group-1",
) {
  return {
    plugin: "ui-plus",
    component: "ToolGroup",
    requestId,
    props: {
      calls: toolUseIds.map((toolUseId) => ({
        tool_use_id: toolUseId,
        tool: "Read",
        input: {},
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      })),
      isActive: false,
      isExpanded: false,
    },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}

/**
 * ツールの進行の行を描画する対象を作る
 * @param toolUseId ツール呼び出しの識別子
 * @returns ui.mount に渡す対象
 */
export function toolProgressRow(toolUseId: string) {
  return {
    plugin: "ui-plus",
    component: "ToolProgress",
    requestId: `progress-${toolUseId}`,
    props: {
      tool_use_id: toolUseId,
      kind: "background_hint",
      hint: "(ctrl+b to run in background)",
    },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}

/**
 * 回答の所要時間の行を描画する対象を作る
 * @param isExpanded 全体表示か
 * @returns ui.mount に渡す対象
 */
export function turnDurationRow(isExpanded = false) {
  return {
    plugin: "ui-plus",
    component: "TurnDuration",
    requestId: "duration-1",
    props: { word: "Baked", durationMs: 3000, isExpanded },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}

/**
 * 起動時のお知らせの行を描画する対象を作る
 * @returns ui.mount に渡す対象
 */
export function infoNoticeRow() {
  return {
    plugin: "ui-plus",
    component: "InfoNotice",
    requestId: "notice-1",
    props: { text: "お知らせ", command: null },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}

/**
 * スラッシュコマンドの出力の行を描画する対象を作る
 * @returns ui.mount に渡す対象
 */
export function commandOutputRow() {
  return {
    plugin: "ui-plus",
    component: "CommandOutput",
    requestId: "command-1",
    props: { command: "cost", args: "", text: "出力", isErrored: false },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}

/**
 * 回答の開始を、エージェントを指定して起こす
 * @param $ テストキットのエンジン
 * @param turnId 回答の識別子
 * @param agentId サブエージェントの識別子。メインなら省略
 */
export async function startTurn($: Engine, turnId: string, agentId?: string) {
  await $.turn.start({
    text: "質問",
    turnId,
    ...(agentId === undefined ? {} : { agentId }),
  });
}

/**
 * 回答の終了を、エージェントと理由を指定して起こす
 * @param $ テストキットのエンジン
 * @param turnId 回答の識別子
 * @param options 既定から変える項目
 * @param options.agentId サブエージェントの識別子。メインなら省略
 * @param options.reason 終了の理由
 */
export async function endTurn(
  $: Engine,
  turnId: string,
  options: { agentId?: string; reason?: "answer" | "aborted" | "error" } = {},
) {
  const reason = options.reason ?? "answer";

  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: reason === "aborted",
    turnId,
    reason,
    ...(options.agentId === undefined ? {} : { agentId: options.agentId }),
  });
}

/**
 * ツールを1回呼び、その呼び出しの識別子を返す
 * @param $ テストキットのエンジン
 * @param calls stub が受けた呼び出しの記録
 * @returns ツール呼び出しの識別子
 */
export async function callTool($: Engine, calls: Calls) {
  await $.tool.call({ tool: "Read", file_path: "/repo/a.ts" });

  return calls.toolUseIds.at(-1) ?? "";
}

/**
 * 質問を描画する対象を作る
 * @param text 質問の文章
 * @param options 既定から変える項目
 * @param options.requestId 質問の識別子。省略すると、他のテストと重ならない識別子にする
 * @param options.origin 質問の出どころ。省略すると、入力欄から送った質問にする
 * @param options.isExpanded 全体表示か
 * @returns ui.mount に渡す対象
 */
export function question(
  text: string,
  options: {
    requestId?: string;
    origin?: { kind: "composer" } | { kind: "unclassified" };
    isExpanded?: boolean;
  } = {},
) {
  return {
    plugin: "ui-plus",
    component: "UserMessage",
    requestId: options.requestId ?? nextRequestId("question"),
    props: {
      text,
      origin: options.origin ?? { kind: "composer" },
      isExpanded: options.isExpanded ?? false,
    },
    surface: "terminal",
    viewport: VIEWPORT,
  } as const;
}
