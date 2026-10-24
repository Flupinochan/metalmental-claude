import { findCodeBlockAt } from "./findCodeBlockAt";
import { findTableAt } from "./findTableAt";

// 表とコードブロックの用語は、findTableAt.ts と findCodeBlockAt.ts を参照
// ドメイン用語
// | 日本語     | 英語             | 定義                                                           |
// | ---------- | ---------------- | -------------------------------------------------------------- |
// | 回答       | assistantMessage | 生成AIの回答の Markdown 全体                                   |
// | 行         | line             | 回答を改行で分けた1行                                          |
// | 回答の部分 | messagePart      | 回答を、通常の文章、表、コードに分けたときの1つ分             |
// | 部分の種類 | kind             | 部分が通常の文章 (plain)、表 (table)、コード (code) かを示す値 |
// | 通常の文章 | plainText        | 表とコードブロックを含まない部分の Markdown                   |
// | コピー対象 | copyTarget       | ボタンでコピーできる部分。表とコードブロック                   |

export type MessagePart =
  | { readonly kind: "plain"; readonly plainText: string }
  | { readonly kind: "table"; readonly tableText: string }
  | {
      readonly kind: "code";
      readonly codeText: string;
      readonly codeBlockText: string;
    };

const EDGE_BLANK_LINES = /^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g;

/**
 * 回答を、通常の部分と表とコードに分ける
 * コードブロックを先に判定し、コードブロックの中の表は表にしない。中身が空のコードブロックは通常の部分にする
 * @param assistantMessage 回答の Markdown
 * @returns 回答の順に並んだ、通常の文章と表とコード
 */
export function splitCopyTargetsFromAssistantMessage(assistantMessage: string) {
  const lines = assistantMessage.replace(/\r\n?/g, "\n").split("\n");
  const messageParts: MessagePart[] = [];
  let plainLines: string[] = [];
  let index = 0;

  const pushPlainPart = () => {
    const plainText = plainLines.join("\n").replace(EDGE_BLANK_LINES, "");
    plainLines = [];

    if (plainText.trim() !== "") {
      messageParts.push({ kind: "plain", plainText });
    }
  };

  while (index < lines.length) {
    const codeBlock = findCodeBlockAt(lines, index);

    if (codeBlock !== undefined) {
      if (codeBlock.codeText.trim() !== "") {
        pushPlainPart();
        messageParts.push({
          kind: "code",
          codeText: codeBlock.codeText,
          codeBlockText: codeBlock.codeBlockLines.join("\n"),
        });
      } else {
        plainLines.push(...codeBlock.codeBlockLines);
      }

      index = codeBlock.nextIndex;
      continue;
    }

    const table = findTableAt(lines, index);

    if (table !== undefined) {
      pushPlainPart();
      messageParts.push({ kind: "table", tableText: table.tableText });
      index = table.nextIndex;
      continue;
    }

    plainLines.push(lines[index] ?? "");
    index += 1;
  }

  pushPlainPart();

  return messageParts;
}
