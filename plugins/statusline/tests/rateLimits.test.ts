import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { summarizeRateLimits } from "../hooks/rateLimits";

const localIso = (month: number, day: number, hour: number, minute: number) =>
  new Date(2026, month - 1, day, hour, minute).toISOString();

test("RL-1: 5h は時分、7d は月日と時分をリセット日時に付ける", () => {
  const texts = summarizeRateLimits([
    {
      kind: "five_hour",
      percentUsed: 12,
      resetsAt: localIso(10, 24, 14, 30),
    },
    {
      kind: "seven_day",
      percentUsed: 40,
      resetsAt: localIso(10, 25, 14, 30),
    },
  ]).map(({ text }) => text);

  expect(texts).toEqual(["5h:12%(14:30)", "7d:40%(10/25 14:30)"]);
});

test("RL-1: 該当する制限がなければ、5h:-- と 7d:-- を blue で表示する", () => {
  expect(summarizeRateLimits([])).toEqual([
    { kind: "five_hour", text: "5h:--", color: COLOR.blue },
    { kind: "seven_day", text: "7d:--", color: COLOR.blue },
  ]);
});

test("RL-1: 月日と時分は2桁にそろえる", () => {
  const [, sevenDay] = summarizeRateLimits([
    {
      kind: "seven_day",
      percentUsed: 40,
      resetsAt: localIso(1, 5, 7, 5),
    },
  ]);

  expect(sevenDay?.text).toBe("7d:40%(01/05 07:05)");
});

test("RL-2: リセット日時がなければ、括弧を付けない", () => {
  const [fiveHour] = summarizeRateLimits([
    { kind: "five_hour", percentUsed: 12 },
  ]);

  expect(fiveHour?.text).toBe("5h:12%");
});

for (const [percentUsed, expected] of [
  [0, "green"],
  [49.6, "green"],
  [50, "yellow"],
  [79.5, "yellow"],
  [80, "red"],
] as const) {
  test(`RL-3: ${percentUsed} の色は ${expected} にする`, () => {
    const [fiveHour] = summarizeRateLimits([
      { kind: "five_hour", percentUsed },
    ]);

    expect(fiveHour?.color).toBe(COLOR[expected]);
  });
}

test("RL-4: 5h、7d の順に並べ、それ以外の種類は表示しない", () => {
  const kinds = summarizeRateLimits([
    { kind: "monthly", percentUsed: 1 },
    { kind: "seven_day", percentUsed: 40 },
    { kind: "five_hour", percentUsed: 12 },
  ]).map(({ kind }) => kind);

  expect(kinds).toEqual(["five_hour", "seven_day"]);
});
