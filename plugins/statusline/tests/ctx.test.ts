import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { ctxColor, formatCtx } from "../hooks/ctx";

for (const [percent, expected] of [
  [0, "ctx:0%"],
  [42.4, "ctx:42%"],
  [42.5, "ctx:43%"],
  [100, "ctx:100%"],
  [undefined, "ctx:--"],
] as const) {
  test(`CTX-1: ${String(percent)} は ${expected} と表示する`, () => {
    expect(formatCtx(percent)).toBe(expected);
  });
}

for (const [percent, expected] of [
  [undefined, "blue"],
  [0, "green"],
  [49.6, "green"],
  [50, "yellow"],
  [79.5, "yellow"],
  [80, "red"],
  [100, "red"],
] as const) {
  test(`CTX-2: ${String(percent)} の色は ${expected} にする`, () => {
    expect(ctxColor(percent)).toBe(COLOR[expected]);
  });
}
