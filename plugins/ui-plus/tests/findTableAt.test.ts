import { expect, test } from "claude-code/testing";

import { findTableAt } from "../hooks/findTableAt";
import { TABLE } from "./helpers";

const linesOf = (text: string) => text.split("\n");

test("TBL-1: 表が始まる行から、表の文字列と次に読む行の位置を返す", () => {
  const lines = linesOf(`前\n${TABLE}\n\n後`);

  expect(findTableAt(lines, 1)).toEqual({ tableText: TABLE, nextIndex: 5 });
});

test("TBL-2: 表が始まらない行は、undefined を返す", () => {
  expect(findTableAt(linesOf(`前\n${TABLE}`), 0)).toBeUndefined();
});

test("TBL-3: 配置指定の区切り行と、外側の | がない表も表にする", () => {
  const aligned = "a | b\n:-- | --:\n1 | 2";

  expect(findTableAt(linesOf(aligned), 0)?.tableText).toBe(aligned);
});

test("TBL-4: 区切り行がまだない表は、表にしない", () => {
  expect(findTableAt(["| 名前 | 値 |"], 0)).toBeUndefined();
});

test("TBL-4: 区切り行の途中までの表は、表にしない", () => {
  expect(findTableAt(["| 名前 | 値 |", "| ---"], 0)).toBeUndefined();
});

test("TBL-5: 見出し行と区切り行の列数が違うものは、表にしない", () => {
  expect(findTableAt(["| a | b |", "| --- |"], 0)).toBeUndefined();
});

test("TBL-5: 区切り行だけの水平線は、表にしない", () => {
  expect(findTableAt(["a", "---", "b"], 0)).toBeUndefined();
});

test("TBL-6: 引用とリストの中の表は、表にしない", () => {
  const quoted = `> ${TABLE.replaceAll("\n", "\n> ")}`;
  const listed = `- ${TABLE.replaceAll("\n", "\n  ")}`;

  expect(findTableAt(linesOf(quoted), 0)).toBeUndefined();
  expect(findTableAt(linesOf(listed), 0)).toBeUndefined();
});

test("TBL-7: 表の行は、空行か | のない行で終わる", () => {
  expect(findTableAt(linesOf(`${TABLE}\n続きの文章`), 0)).toEqual({
    tableText: TABLE,
    nextIndex: 4,
  });
});
