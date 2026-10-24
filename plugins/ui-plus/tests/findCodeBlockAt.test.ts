import { expect, test } from "claude-code/testing";

import { findCodeBlockAt } from "../hooks/findCodeBlockAt";
import { CODE, CODE_BLOCK, TABLE } from "./helpers";

const linesOf = (text: string) => text.split("\n");

test("BLK-1: コードブロックが始まる行から、コードブロックの行とコードと次に読む行の位置を返す", () => {
  const lines = linesOf(`前\n${CODE_BLOCK}\n後`);

  expect(findCodeBlockAt(lines, 1)).toEqual({
    codeBlockLines: linesOf(CODE_BLOCK),
    codeText: CODE,
    nextIndex: 5,
  });
});

test("BLK-2: コードブロックが始まらない行は、undefined を返す", () => {
  expect(findCodeBlockAt(linesOf(`前\n${CODE_BLOCK}`), 0)).toBeUndefined();
});

for (const language of ["", "bash", "sql", "ts", "python", "json"]) {
  test(`BLK-3: 言語が ${language === "" ? "空" : language} のコードブロックも、コードブロックにする`, () => {
    const lines = ["```" + language, "x", "```"];

    expect(findCodeBlockAt(lines, 0)?.codeText).toBe("x");
  });
}

test("BLK-4: バッククォートを含む行は、開始のフェンス行にしない", () => {
  expect(findCodeBlockAt(["```code``` と書く"], 0)).toBeUndefined();
});

test("BLK-5: 終了のフェンス行がないコードブロックは、回答の最後までをコードにする", () => {
  expect(findCodeBlockAt(["```bash", "ls", "pwd"], 0)).toEqual({
    codeBlockLines: ["```bash", "ls", "pwd"],
    codeText: "ls\npwd",
    nextIndex: 3,
  });
});

test("BLK-6: 終了のフェンス行は、開始と同じ文字で開始以上の長さの行にする", () => {
  const lines = ["````bash", "```", "ls", "````"];

  expect(findCodeBlockAt(lines, 0)?.codeText).toBe("```\nls");
  expect(
    findCodeBlockAt(["```bash", "ls", "~~~", "pwd", "```"], 0)?.codeText,
  ).toBe("ls\n~~~\npwd");
});

test("BLK-7: チルダのフェンス行も、コードブロックにする", () => {
  expect(findCodeBlockAt(["~~~", "ls", "~~~"], 0)?.codeText).toBe("ls");
});

test("BLK-8: コードブロックの中の表も、コードにする", () => {
  expect(
    findCodeBlockAt(linesOf(`\`\`\`\n${TABLE}\n\`\`\``), 0)?.codeText,
  ).toBe(TABLE);
});
