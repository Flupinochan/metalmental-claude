import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { summarizeReviews } from "../hooks/review";
import { BAND, colorOf, startLoadedSession } from "./helpers";

test("RV-1: review、simplify、security の順に並べ、未実行は orange にする", () => {
  expect(summarizeReviews([])).toEqual([
    { command: "code-review", label: "review", color: COLOR.orange },
    { command: "simplify", label: "simplify", color: COLOR.orange },
    { command: "security-review", label: "security", color: COLOR.orange },
  ]);
});

test("RV-1: 実行済みのコマンドだけを green にする", () => {
  const colors = summarizeReviews(["simplify"]).map(({ color }) => color);

  expect(colors).toEqual([COLOR.orange, COLOR.green, COLOR.orange]);
});

for (const [key, command] of [
  ["review", "code-review"],
  ["simplify", "simplify"],
  ["security", "security-review"],
] as const) {
  test(`BTN-2: ${key} を押すと、入力欄を /${command} に置き換える`, async ($, on) => {
    const { calls, clock } = await startLoadedSession($, on);
    const ui = await $.ui.mount(BAND);
    await ui.press({ key });
    await clock.advance(1);

    expect(calls.fills).toEqual([{ text: `/${command}`, mode: "replace" }]);
  });
}

test("BTN-3: 入力できたら、実行済みとして green にする", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "review" });
  await clock.advance(1);

  expect(await colorOf(ui, /^review$/)).toBe(COLOR.green);
  expect(calls.logs).toEqual([]);
});

test("BTN-3: 入力できなかったら、orange のままデバッグログに残す", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on, {
    fill: { isFilled: false },
  });
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "review" });
  await clock.advance(1);

  expect(await colorOf(ui, /^review$/)).toBe(COLOR.orange);
  expect(calls.logs).toEqual(["prompt fill failed: /code-review (unknown)"]);
});
