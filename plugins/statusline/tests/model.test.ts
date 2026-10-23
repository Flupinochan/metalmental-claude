import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { formatModel, modelColor } from "../hooks/model";

for (const [modelId, expected] of [
  ["claude-opus-5-5[1m]", "opus5.5"],
  ["claude-sonnet-5-5", "sonnet5.5"],
  ["claude-fable-5-1", "fable5.1"],
  ["claude-haiku-5-5", "haiku5.5"],
] as const) {
  test(`MD-1: ${modelId} は ${expected} と表示する`, () => {
    expect(formatModel(modelId)).toBe(expected);
  });
}

for (const [modelId, expected] of [
  ["claude-sonnet-5-5", "green"],
  ["claude-opus-5-5", "yellow"],
  ["claude-fable-5-1", "red"],
  ["claude-haiku-5-5", "blue"],
  ["unknown-model", "blue"],
  ["claude-OPUS-5-5", "yellow"],
] as const) {
  test(`MD-2: ${modelId} の色は ${expected} にする`, () => {
    expect(modelColor(modelId)).toBe(COLOR[expected]);
  });
}
