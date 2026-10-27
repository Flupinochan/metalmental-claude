import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import {
  directoryName,
  padPathToWidth,
  workingDirectoryColor,
} from "../hooks/workingDirectory";
import { BAND, startLoadedSession } from "./helpers";

for (const [path, expected] of [
  ["/home/u/project", "project"],
  ["/home/u/project/", "project"],
  ["/", "/"],
  ["C:\\Users\\u\\project", "project"],
  ["C:\\Users\\u\\project\\", "project"],
] as const) {
  test(`DIR-1: ${path} は ${expected} と表示する`, () => {
    expect(directoryName(path)).toBe(expected);
  });
}

for (const [path, expected] of [
  ["/home/u/project", "yellow"],
  ["/home/u/project/.claude/worktrees/x", "blue"],
] as const) {
  test(`DIR-2: ${path} の色は ${expected} にする`, () => {
    expect(workingDirectoryColor(path)).toBe(COLOR[expected]);
  });
}

test("UI-6: 横幅が分かるなら、絶対パスの後ろをno-break space で埋める", () => {
  expect(padPathToWidth("/home/u", 20)).toBe(`/home/u${" ".repeat(11)}`);
});

test("UI-6: 絶対パスが横幅より長いなら、埋めない", () => {
  expect(padPathToWidth("/home/u/project", 10)).toBe("/home/u/project");
});

test("UI-6: 横幅が分からないなら、絶対パスをそのまま返す", () => {
  expect(padPathToWidth("/home/u", undefined)).toBe("/home/u");
});

test("BTN-1: ディレクトリ名を押すと、絶対パスをコピーする", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "working-directory" });

  expect(calls.copies).toEqual([{ text: "/home/x/proj", surface: "terminal" }]);
});

test("BTN-1: コピーに失敗したら、デバッグログに残す", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on, {
    copy: { isCopied: false, reason: "refused" },
  });
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "working-directory" });
  await clock.advance(1);

  expect(calls.logs).toEqual(["copy failed: refused"]);
});
