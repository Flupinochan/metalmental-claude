import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { BAND, colorOf, shownTexts, startLoadedSession } from "./helpers";

test("OS-1: 設定が文字列なら、その名前を orange で表示する", async ($, on) => {
  await startLoadedSession($, on, { outputStyle: "Learning" });
  const ui = await $.ui.mount(BAND);

  expect(await colorOf(ui, /^Learning$/)).toBe(COLOR.orange);
});

for (const outputStyle of [undefined, 123, {}]) {
  test(`OS-1: 設定が文字列でない (${outputStyle === undefined ? "undefined" : JSON.stringify(outputStyle)}) なら、表示しない`, async ($, on) => {
    await startLoadedSession($, on, { outputStyle });
    const ui = await $.ui.mount(BAND);
    const texts = await shownTexts(ui);

    expect(texts.map((text) => text.replace(/\(.*\)$/, ""))).toEqual([
      "↻",
      "clean",
      "proj",
      "main",
      "PR #12",
      "opus5.5",
      "ctx:42%",
      "5h:12%",
      "7d:40%",
      "review",
      "simplify",
      "security",
      "node:22.1.0",
    ]);
  });
}
