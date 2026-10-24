import { expect, test } from "claude-code/testing";

import { firstLineOf, isMultiline } from "../hooks/foldText";

test("FTX-1: 空でない行が2行以上あれば、複数行にする", () => {
  expect(isMultiline("1行目\n\n3行目")).toBe(true);
});

test("FTX-2: 空でない行が1行なら、空行があっても複数行にしない", () => {
  expect(isMultiline("1行目")).toBe(false);
  expect(isMultiline("\n1行目\n\n")).toBe(false);
});

test("FTX-3: 1行目は、最初の空でない行にする", () => {
  expect(firstLineOf("\n\n結論です\n詳細")).toBe("結論です");
});

test("FTX-4: 1行目から、見出し、箇条書き、強調、バッククォートの記号を外す", () => {
  expect(firstLineOf("## **結論** は `foo` です\n\n詳細")).toBe(
    "結論 は foo です",
  );
  expect(firstLineOf("- 項目\n詳細")).toBe("項目");
  expect(firstLineOf("1. 手順\n詳細")).toBe("手順");
});
