import { expect, test } from "claude-code/testing";

import { formatBunVersion, isBunProject, parseBunVersion } from "../hooks/bun";
import { COLOR } from "../hooks/colors";
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

const BUN_PROJECT = { entries: [file("bun.lock")] };

for (const name of ["bun.lock", "bun.lockb", "bunfig.toml"]) {
  test(`BUN-1: ${name} があれば、対象にする`, () => {
    expect(isBunProject([file(name)])).toBe(true);
  });
}

for (const [name, entries] of [
  ["何もない", []],
  ["package.json だけがある", [file("package.json")]],
  ["index.ts だけがある", [file("index.ts")]],
  ["bun.lock という名前のフォルダだけがある", [folder("bun.lock")]],
] as const) {
  test(`BUN-1: ${name}なら、対象にしない`, () => {
    expect(isBunProject(entries)).toBe(false);
  });
}

test("BUN-1: 対象でなければ、表示せず、bun を実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^bun:/)).toBe(false);
  expect(calls.bunVersion).toHaveLength(0);
});

test("BUN-2: 出力の前後の空白を除いて、版にする", () => {
  expect(parseBunVersion("1.2.3\n")).toBe("1.2.3");
  expect(parseBunVersion("")).toBe("");
});

test("BUN-2: bun:版 の形で表示する", () => {
  expect(formatBunVersion("1.2.3")).toBe("bun:1.2.3");
});

test("BUN-2: bun --version を 3000ms で実行し、一番右に purple で表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    entries: [
      file("pyproject.toml"),
      file("Cargo.toml"),
      file("go.mod"),
      file("bun.lock"),
    ],
  });
  const ui = await $.ui.mount(BAND);
  const texts = await shownTexts(ui);

  expect(texts.slice(-4)).toEqual([
    "python:3.12.3",
    "rust:1.92.0",
    "go:1.25.0",
    "bun:1.2.3",
  ]);
  expect(await colorOf(ui, "bun:1.2.3")).toBe(COLOR.purple);
  expect(calls.bunVersion).toEqual([
    { argv: ["bun", "--version"], cwd: "/home/x/proj", timeoutMs: 3000 },
  ]);
});

test("BUN-2: bun のプロジェクトでは、node は表示しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    entries: [file("package.json"), file("bun.lock")],
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^node:/)).toBe(false);
  expect(await isShown(ui, "bun:1.2.3")).toBe(true);
  expect(calls.bunVersion).toHaveLength(1);
});

test("BUN-3: 終了コードが 0 でなければ、表示しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...BUN_PROJECT,
    bun: { exitCode: 1 },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^bun:/)).toBe(false);
  expect(calls.logs).toEqual([]);
});

test("BUN-3: 起動できない場合は、表示せず、デバッグログに残す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...BUN_PROJECT,
    bun: { fails: true },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^bun:/)).toBe(false);
  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^bun --version failed: /);
});

test("BUN-4: 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession($, on, BUN_PROJECT);
  await completeTurn($);
  await clock.advance(1);

  expect(calls.bunVersion).toHaveLength(1);

  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.bunVersion).toHaveLength(2);

  state.cwd = "/home/x/other";
  await completeTurn($);
  await clock.advance(1);

  expect(calls.bunVersion).toHaveLength(3);
  expect(calls.bunVersion[2]?.cwd).toBe("/home/x/other");
});

test("BUN-4: 作業ディレクトリが対象でなくなれば、表示しない", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on, BUN_PROJECT);
  state.entries = [];
  await completeTurn($);
  await clock.advance(1);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^bun:/)).toBe(false);
});
