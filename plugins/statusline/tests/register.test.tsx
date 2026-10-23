import { expect, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";
import type { On } from "claude-code";

import {
  BAND,
  GIT_MODIFIED,
  completeTurn,
  isShown,
  runCommand,
  shownTexts,
  startLoadedSession,
  startSession,
  stubStandardBand,
} from "./helpers";
import type { State } from "./helpers";

test("UI-1: 並び順は、リロード、git、ディレクトリ、ブランチ名、PR、モデル、output style、ctx、5h、7d、review の3ボタン、node", async ($, on) => {
  await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  const texts = await shownTexts(ui);

  expect(texts.map((text) => text.replace(/\(.*\)$/, ""))).toEqual([
    "↻",
    "clean",
    "proj",
    "main",
    "PR #12",
    "opus5.5",
    "Learning",
    "ctx:42%",
    "5h:12%",
    "7d:40%",
    "review",
    "simplify",
    "security",
    "node:22.1.0",
  ]);
});

test("UI-2: アンケートが出ている間は、表示しない", async ($, on) => {
  stubStandardBand(on);
  await startLoadedSession($, on);
  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
  });

  expect(await shownTexts(ui)).toEqual(["標準の表示"]);
});

test("UI-3: 未取得の間は、git、ディレクトリ、ブランチ名、PR、モデル、output style を表示せず、他の項目は表示する", async ($) => {
  const ui = await $.ui.mount(BAND);

  expect(await shownTexts(ui)).toEqual([
    "↻",
    "ctx:--",
    "5h:--",
    "7d:--",
    "review",
    "simplify",
    "security",
  ]);
});

for (const surface of ["terminal", "desktop"] as const) {
  test(`UI-4: ${surface} では表示する`, async ($, on) => {
    await startLoadedSession($, on);
    const ui = await $.ui.mount({ ...BAND, surface });

    expect(await isShown(ui, /^ctx:42%$/)).toBe(true);
  });
}

test("UI-5: 押せるのは、リロード、ディレクトリ、PR、review の3ボタン", async ($, on) => {
  await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  const buttons = await ui.findAll({ type: "Button" });

  expect(buttons.map(({ key }) => key)).toEqual([
    "reload",
    "working-directory",
    "pull-request-12",
    "review",
    "simplify",
    "security",
  ]);
});

const CHANGED = {
  ctx: "ctx:77%",
  model: "sonnet5.5",
  style: "Explanatory",
  git: "uncommitted",
} as const;

type Item = keyof typeof CHANGED;

const ALL_ITEMS: Item[] = ["ctx", "model", "style", "git"];

/**
 * セッションを開始し、更新前後を見分けられるよう世界の状態を書き換える
 * @param $ テストキットのエンジン
 * @param on stub を登録する関数
 * @returns 世界の状態、時計
 */
async function startThenChange($: Engine, on: On) {
  const world = await startLoadedSession($, on);
  const changes: Partial<State> = {
    ctxPercent: 77,
    modelId: "claude-sonnet-5-5",
    outputStyle: "Explanatory",
    gitStatus: GIT_MODIFIED,
  };
  Object.assign(world.state, changes);

  return world;
}

/**
 * 描画に、更新後の値が出ている項目を集める
 * @param $ テストキットのエンジン
 * @returns 更新後の値が出ている項目
 */
async function updatedItems($: Engine) {
  const ui = await $.ui.mount(BAND);
  const updated: Item[] = [];

  for (const item of ALL_ITEMS) {
    if (await isShown(ui, CHANGED[item])) {
      updated.push(item);
    }
  }

  return updated;
}

test("EV-1: session.start で全項目を取得する", async ($, on) => {
  await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);

  for (const text of [
    "clean",
    "proj",
    "main",
    "node:22.1.0",
    "PR #12",
    "opus5.5",
    "Learning",
    "ctx:42%",
    /^5h:12%/,
    /^7d:40%/,
  ]) {
    expect(await isShown(ui, text)).toBe(true);
  }
});

test("EV-2: turn.complete は、メインエージェントの完了で全項目を更新する", async ($, on) => {
  const { clock } = await startThenChange($, on);
  await completeTurn($);
  await clock.advance(1);

  expect(await updatedItems($)).toEqual(ALL_ITEMS);
});

test("EV-2: turn.complete は、サブエージェントの完了では更新しない", async ($, on) => {
  const { clock } = await startThenChange($, on);
  await completeTurn($, "sub1");
  await clock.advance(1);

  expect(await updatedItems($)).toEqual([]);
});

test("EV-3: session.measure は、context が変わったときだけ ctx を更新する", async ($, on) => {
  const { state } = await startThenChange($, on);
  state.rateLimits = [{ kind: "five_hour", percentUsed: 90 }];
  await $.session.measure({
    context: { tokens: 0, window: 200000, percent: 77 },
    rateLimits: [],
    changed: ["context"],
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "ctx:77%")).toBe(true);
  expect(await isShown(ui, /^5h:12%/)).toBe(true);
});

test("EV-3: session.measure は、rateLimits が変わったときだけレート制限を更新する", async ($, on) => {
  const { state } = await startThenChange($, on);
  state.rateLimits = [{ kind: "five_hour", percentUsed: 90 }];
  await $.session.measure({
    context: { tokens: 0, window: 200000, percent: 77 },
    rateLimits: [],
    changed: ["rateLimits"],
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "ctx:42%")).toBe(true);
  expect(await isShown(ui, /^5h:90%/)).toBe(true);
});

test("EV-4: classic.PostCompact は ctx のみを更新する", async ($, on) => {
  await startThenChange($, on);
  await $.classic.PostCompact({ trigger: "manual", compact_summary: "x" });

  expect(await updatedItems($)).toEqual(["ctx"]);
});

test("EV-5: config.set は output style のみを更新する", async ($, on) => {
  await startThenChange($, on);
  await $.config.set({
    key: "outputStyle",
    value: "Explanatory",
    previous: "Learning",
    provider: { plugin: "engine", tier: "core" },
    origin: { kind: "composer" },
  });

  expect(await updatedItems($)).toEqual(["style"]);
});

test("EV-6: /model はモデル名のみを更新する", async ($, on) => {
  await startThenChange($, on);
  await runCommand($, "model");

  expect(await updatedItems($)).toEqual(["model"]);
});

test("EV-7: /output-style は output style のみを更新する", async ($, on) => {
  await startThenChange($, on);
  await runCommand($, "output-style");

  expect(await updatedItems($)).toEqual(["style"]);
});

for (const command of ["cd", "clear", "resume", "branch", "rewind"]) {
  test(`EV-8: /${command} は全項目を更新する`, async ($, on) => {
    const { clock } = await startThenChange($, on);
    await runCommand($, command);
    await clock.advance(1);

    expect(await updatedItems($)).toEqual(ALL_ITEMS);
  });
}

test("EV-9: 上記以外のコマンドでは何も更新しない", async ($, on) => {
  const { clock } = await startThenChange($, on);
  await runCommand($, "help");
  await clock.advance(1);

  expect(await updatedItems($)).toEqual([]);
});

test("EV-10: イベントの結果を変えずに返す", async ($, on) => {
  const { state } = await startThenChange($, on);
  state.commandText = "stub answer";

  expect(await runCommand($, "model")).toEqual({ text: "stub answer" });
  expect(await runCommand($, "cd")).toEqual({ text: "stub answer" });
  expect(await runCommand($, "help")).toEqual({ text: "stub answer" });
  expect(await completeTurn($)).toEqual({ text: "" });
});

test("EV-11: 更新で例外が起きても、session.start は完了し、以降も描画できる", async ($, on) => {
  await startSession($, on, { cwdFails: true });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "↻")).toBe(true);
  expect(await isShown(ui, "proj")).toBe(false);
});
