import { expect, test } from "claude-code/testing";

import { displayWidthOf, padLabelToRight } from "../hooks/labelWidth";

test("WID-1: 半角の文字は1、全角の文字と絵文字は2と数える", () => {
  expect(displayWidthOf("abc")).toBe(3);
  expect(displayWidthOf("結論です。")).toBe(10);
  expect(displayWidthOf("▶ 結論")).toBe(6);
  expect(displayWidthOf("✅")).toBe(1);
  expect(displayWidthOf("🚀")).toBe(2);
});

test("WID-2: 結合文字と幅のない文字は、幅に数えない", () => {
  expect(displayWidthOf("é")).toBe(1);
  expect(displayWidthOf("a​b")).toBe(2);
});

test("WID-3: 文言の右側を、横幅から余白を引いた幅まで埋める", () => {
  const padded = padLabelToRight("▶ 結論です", 40, 4);

  expect(displayWidthOf(padded)).toBe(36);
  expect(padded.startsWith("▶ 結論です")).toBe(true);
  expect(padded.endsWith(" ")).toBe(true);
});

test("WID-4: 文言が余白を除いた横幅を超えるときと、横幅が分からないときは、文言をそのまま返す", () => {
  expect(padLabelToRight("▶ 結論です結論です", 10, 4)).toBe(
    "▶ 結論です結論です",
  );
  expect(padLabelToRight("▶ 結論です", undefined, 4)).toBe("▶ 結論です");
});
