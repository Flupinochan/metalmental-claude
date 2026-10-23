import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import {
  directoryName,
  workingDirectoryColor,
} from "../hooks/workingDirectory";
import { BAND, startLoadedSession } from "./helpers";

for (const [path, expected] of [
  ["/home/u/project", "project"],
  ["/home/u/project/", "project"],
  ["/", "/"],
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
