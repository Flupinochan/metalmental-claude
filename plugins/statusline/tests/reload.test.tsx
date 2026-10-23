import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { summarizeReload } from "../hooks/reload";
import {
  BAND,
  GIT_MODIFIED,
  isShown,
  shownTexts,
  startLoadedSession,
} from "./helpers";

for (const [status, icon, color] of [
  ["idle", "↻", "blue"],
  ["loading", "…", "yellow"],
  ["done", "✓", "green"],
  ["failed", "✗", "red"],
] as const) {
  test(`RLD-1: ${status} は ${icon} を ${color} で表示する`, () => {
    expect(summarizeReload(status)).toEqual({ icon, color: COLOR[color] });
  });
}

const iconOf = async (ui: Parameters<typeof shownTexts>[0]) =>
  (await shownTexts(ui))[0];

test("BTN-4: リロードを押すと、全項目を更新する", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession($, on);
  state.ctxPercent = 77;
  state.gitStatus = GIT_MODIFIED;
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(await isShown(ui, "ctx:77%")).toBe(true);
  expect(await isShown(ui, "uncommitted")).toBe(true);
  expect(calls.pullRequestList).toHaveLength(2);
});

test("BTN-4: 更新している間は … を表示する", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on);
  state.gitDelayMs = 100;
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(await iconOf(ui)).toBe("…");

  await clock.advance(100);

  expect(await iconOf(ui)).toBe("✓");
});

test("BTN-5: 実行中の押下は無視する", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on);
  const before = calls.gitStatus.length;
  const ui = await $.ui.mount(BAND);
  await Promise.all([ui.press({ key: "reload" }), ui.press({ key: "reload" })]);
  await clock.advance(1);

  expect(calls.gitStatus.length - before).toBe(1);
});

test("BTN-5: 完了後の押下は、もう一度更新する", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on);
  const before = calls.gitStatus.length;
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(5000);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.gitStatus.length - before).toBe(2);
});

test("BTN-6: 完了後 3 秒間 ✓ を表示して、idle に戻る", async ($, on) => {
  const { clock } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(await iconOf(ui)).toBe("✓");

  await clock.advance(2500);

  expect(await iconOf(ui)).toBe("✓");

  await clock.advance(1000);

  expect(await iconOf(ui)).toBe("↻");
});

test("BTN-7: 更新が失敗したら、デバッグログに残し、✗ を 3 秒間表示して idle に戻る", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession($, on);
  state.cwdFails = true;
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(await iconOf(ui)).toBe("✗");
  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^reload failed: /);

  await clock.advance(3500);

  expect(await iconOf(ui)).toBe("↻");
});
