import { expect, test } from "claude-code/testing";

import { splitTablesFromAssistantMessage } from "../hooks/splitTablesFromAssistantMessage";
import { TABLE } from "./helpers";

test("SEG-1: 表の前後の文章と表を、回答の順に分ける", () => {
  expect(
    splitTablesFromAssistantMessage(`前の文章\n\n${TABLE}\n\n後の文章`),
  ).toEqual([
    { kind: "plain", plainText: "前の文章" },
    { kind: "table", tableText: TABLE },
    { kind: "plain", plainText: "後の文章" },
  ]);
});

test("SEG-2: 表がない回答は、通常の部分1つにする", () => {
  expect(splitTablesFromAssistantMessage("1行目\n2行目")).toEqual([
    { kind: "plain", plainText: "1行目\n2行目" },
  ]);
});

test("SEG-3: 複数の表は、それぞれ別の表にする", () => {
  const other = "| x |\n| - |\n| 1 |";

  expect(splitTablesFromAssistantMessage(`${TABLE}\n\n間\n\n${other}`)).toEqual(
    [
      { kind: "table", tableText: TABLE },
      { kind: "plain", plainText: "間" },
      { kind: "table", tableText: other },
    ],
  );
});

test("SEG-4: 配置指定の区切り行と、外側の | がない表も表にする", () => {
  const aligned = "a | b\n:-- | --:\n1 | 2";

  expect(splitTablesFromAssistantMessage(aligned)).toEqual([
    { kind: "table", tableText: aligned },
  ]);
});

test("SEG-6: 区切り行がまだない表は、表にしない", () => {
  expect(splitTablesFromAssistantMessage("| 名前 | 値 |")).toEqual([
    { kind: "plain", plainText: "| 名前 | 値 |" },
  ]);
});

test("SEG-6: 区切り行の途中までの表は、表にしない", () => {
  expect(splitTablesFromAssistantMessage("| 名前 | 値 |\n| ---")).toEqual([
    { kind: "plain", plainText: "| 名前 | 値 |\n| ---" },
  ]);
});

test("SEG-7: 見出し行と区切り行の列数が違うものは、表にしない", () => {
  expect(splitTablesFromAssistantMessage("| a | b |\n| --- |")).toEqual([
    { kind: "plain", plainText: "| a | b |\n| --- |" },
  ]);
});

test("SEG-7: 区切り行だけの水平線は、表にしない", () => {
  expect(splitTablesFromAssistantMessage("a\n---\nb")).toEqual([
    { kind: "plain", plainText: "a\n---\nb" },
  ]);
});

test("SEG-8: 引用とリストの中の表は、表にしない", () => {
  const quoted = `> ${TABLE.replaceAll("\n", "\n> ")}`;
  const listed = `- ${TABLE.replaceAll("\n", "\n  ")}`;

  expect(splitTablesFromAssistantMessage(quoted)).toEqual([
    { kind: "plain", plainText: quoted },
  ]);
  expect(splitTablesFromAssistantMessage(listed)).toEqual([
    { kind: "plain", plainText: listed },
  ]);
});

test("SEG-9: 表の行は、空行か | のない行で終わる", () => {
  expect(splitTablesFromAssistantMessage(`${TABLE}\n続きの文章`)).toEqual([
    { kind: "table", tableText: TABLE },
    { kind: "plain", plainText: "続きの文章" },
  ]);
});

test("SEG-10: 改行が CRLF でも、LF にそろえて分ける", () => {
  expect(
    splitTablesFromAssistantMessage(TABLE.replaceAll("\n", "\r\n")),
  ).toEqual([{ kind: "table", tableText: TABLE }]);
});
