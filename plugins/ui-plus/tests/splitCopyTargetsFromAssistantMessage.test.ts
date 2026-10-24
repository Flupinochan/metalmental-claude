import { expect, test } from "claude-code/testing";

import { splitCopyTargetsFromAssistantMessage } from "../hooks/splitCopyTargetsFromAssistantMessage";
import { CODE, CODE_BLOCK, TABLE } from "./helpers";

test("SEG-1: 表の前後の文章と表を、回答の順に分ける", () => {
  expect(
    splitCopyTargetsFromAssistantMessage(`前の文章\n\n${TABLE}\n\n後の文章`),
  ).toEqual([
    { kind: "plain", plainText: "前の文章" },
    { kind: "table", tableText: TABLE },
    { kind: "plain", plainText: "後の文章" },
  ]);
});

test("SEG-2: 表もコードブロックもない回答は、通常の部分1つにする", () => {
  expect(splitCopyTargetsFromAssistantMessage("1行目\n2行目")).toEqual([
    { kind: "plain", plainText: "1行目\n2行目" },
  ]);
});

test("SEG-3: 複数の表は、それぞれ別の表にする", () => {
  const other = "| x |\n| - |\n| 1 |";

  expect(
    splitCopyTargetsFromAssistantMessage(`${TABLE}\n\n間\n\n${other}`),
  ).toEqual([
    { kind: "table", tableText: TABLE },
    { kind: "plain", plainText: "間" },
    { kind: "table", tableText: other },
  ]);
});

test("SEG-4: 改行が CRLF でも、LF にそろえて分ける", () => {
  expect(
    splitCopyTargetsFromAssistantMessage(TABLE.replaceAll("\n", "\r\n")),
  ).toEqual([{ kind: "table", tableText: TABLE }]);
});

test("SEG-5: コードブロックは、コードとコードブロックの文字列に分ける", () => {
  expect(
    splitCopyTargetsFromAssistantMessage(`前\n\n${CODE_BLOCK}\n\n後`),
  ).toEqual([
    { kind: "plain", plainText: "前" },
    { kind: "code", codeText: CODE, codeBlockText: CODE_BLOCK },
    { kind: "plain", plainText: "後" },
  ]);
});

test("SEG-6: 表とコードブロックは、回答の順に分ける", () => {
  expect(
    splitCopyTargetsFromAssistantMessage(`${TABLE}\n\n${CODE_BLOCK}`),
  ).toEqual([
    { kind: "table", tableText: TABLE },
    { kind: "code", codeText: CODE, codeBlockText: CODE_BLOCK },
  ]);
});

test("SEG-7: 言語によらず、コードブロックはコードにする", () => {
  const codeBlock = "```ts\nconst a = 1;\n```";

  expect(splitCopyTargetsFromAssistantMessage(codeBlock)).toEqual([
    { kind: "code", codeText: "const a = 1;", codeBlockText: codeBlock },
  ]);
});

test("SEG-8: コードブロックの中の表は、表にしない", () => {
  const codeBlock = `\`\`\`\n${TABLE}\n\`\`\``;

  expect(splitCopyTargetsFromAssistantMessage(codeBlock)).toEqual([
    { kind: "code", codeText: TABLE, codeBlockText: codeBlock },
  ]);
});

test("SEG-9: 中身が空のコードブロックは、通常の文章にする", () => {
  expect(splitCopyTargetsFromAssistantMessage("```bash\n\n```")).toEqual([
    { kind: "plain", plainText: "```bash\n\n```" },
  ]);
});
