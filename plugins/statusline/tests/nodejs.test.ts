import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import {
  formatNodeVersion,
  isNodeProject,
  parseNodeVersion,
} from "../hooks/nodejs";
import {
  BAND,
  colorOf,
  completeTurn,
  file,
  folder,
  isShown,
  shownTexts,
  startLoadedSession,
} from "./helpers";

for (const [name, entries] of [
  ["package.json", [file("package.json")]],
  [".node-version", [file(".node-version")]],
  [".nvmrc", [file(".nvmrc")]],
  ["node_modules フォルダ", [folder("node_modules")]],
  ["index.js", [file("index.js")]],
  ["a.mjs", [file("a.mjs")]],
  ["b.cjs", [file("b.cjs")]],
  ["c.ts", [file("c.ts")]],
  ["d.mts", [file("d.mts")]],
  ["e.cts", [file("e.cts")]],
] as const) {
  test(`NODE-1: ${name} があれば、対象にする`, () => {
    expect(isNodeProject(entries)).toBe(true);
  });
}

for (const [name, entries] of [
  ["何もない", []],
  ["README.md だけがある", [file("README.md")]],
  ["package.json という名前のフォルダだけがある", [folder("package.json")]],
] as const) {
  test(`NODE-1: ${name}なら、対象にしない`, () => {
    expect(isNodeProject(entries)).toBe(false);
  });
}

for (const [name, excluded] of [
  ["bunfig.toml", file("bunfig.toml")],
  ["bun.lock", file("bun.lock")],
  ["bun.lockb", file("bun.lockb")],
  ["deno.json", file("deno.json")],
  ["deno.jsonc", file("deno.jsonc")],
  ["deno.lock", file("deno.lock")],
  ["esy.lock フォルダ", folder("esy.lock")],
] as const) {
  test(`NODE-2: ${name} があれば、package.json があっても対象にしない`, () => {
    expect(isNodeProject([file("package.json"), excluded])).toBe(false);
  });
}

test("NODE-2: esy.lock は、フォルダでなければ除外しない", () => {
  expect(isNodeProject([file("package.json"), file("esy.lock")])).toBe(true);
});

test("NODE-3: node --version の出力から、先頭の v と空白を除く", () => {
  expect(parseNodeVersion("v22.1.0\n")).toBe("22.1.0");
  expect(parseNodeVersion("22.1.0")).toBe("22.1.0");
});

test("NODE-3: node:版 の形で表示する", () => {
  expect(formatNodeVersion("22.1.0")).toBe("node:22.1.0");
});

test("NODE-3: 作業ディレクトリで node --version を 3000ms のタイムアウトで実行し、一番右に green で表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  const texts = await shownTexts(ui);

  expect(texts.at(-1)).toBe("node:22.1.0");
  expect(await colorOf(ui, "node:22.1.0")).toBe(COLOR.green);
  expect(calls.nodeVersion).toEqual([
    {
      argv: ["node", "--version"],
      cwd: "/home/x/proj",
      timeoutMs: 3000,
    },
  ]);
});

test("NODE-1: 対象でなければ、表示せず、node を実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, { entries: [] });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^node:/)).toBe(false);
  expect(calls.nodeVersion).toHaveLength(0);
});

test("NODE-4: 終了コードが 0 でなければ、表示しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, { nodeExitCode: 1 });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^node:/)).toBe(false);
  expect(calls.logs).toEqual([]);
});

test("NODE-4: 起動できない場合は、表示せず、デバッグログに残す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, { nodeFails: true });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^node:/)).toBe(false);
  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^node --version failed: /);
});

test("NODE-5: 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession($, on);
  await completeTurn($);
  await clock.advance(1);

  expect(calls.nodeVersion).toHaveLength(1);

  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.nodeVersion).toHaveLength(2);

  state.cwd = "/home/x/other";
  await completeTurn($);
  await clock.advance(1);

  expect(calls.nodeVersion).toHaveLength(3);
  expect(calls.nodeVersion[2]?.cwd).toBe("/home/x/other");
});

test("NODE-5: 作業ディレクトリが対象でなくなれば、表示しない", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on);
  state.entries = [];
  await completeTurn($);
  await clock.advance(1);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^node:/)).toBe(false);
});
