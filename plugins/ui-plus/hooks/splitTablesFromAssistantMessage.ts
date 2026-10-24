// ドメイン用語
// | 日本語     | 英語             | 定義                                             |
// | ---------- | ---------------- | ------------------------------------------------ |
// | 回答       | assistantMessage | 生成AIの回答の Markdown 全体                     |
// | 行         | line             | 回答を改行で分けた1行。表かどうかは問わない      |
// | 回答の部分 | messagePart      | 回答を、通常の文章と表に分けたときの1つ分        |
// | 部分の種類 | kind             | 部分が通常の文章 (plain) か表 (table) かを示す値 |
// | 通常の文章 | plainText        | 表を含まない部分の Markdown                      |
// | 表         | table            | 見出し行、区切り行、表の行が続くひとまとまり     |
// | 表の文字列 | tableText        | 表の元の Markdown。コピーの対象                  |
// | 見出し行   | headerLine       | 表の1行目。列の名前が並ぶ                        |
// | 区切り行   | separatorLine    | 表の2行目。--- が並ぶ                            |
// | 表の行     | row              | 表の中の1行 (見出し行、区切り行、データ行を含む) |
// | 列         | column           | 表の縦の区切り。縦線で区切られる                 |

export type MessagePart =
  | { readonly kind: "plain"; readonly plainText: string }
  | { readonly kind: "table"; readonly tableText: string };

const TABLE_SEPARATOR = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const NON_CODE_INDENT_START = /^ {0,3}\S/;
const EDGE_BLANK_LINES = /^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g;

/**
 * 表の1行の列数を数える
 * 先頭と末尾の | と、\| でエスケープされた | は区切りに含めない
 * @param row 表の1行
 * @returns 列数
 */
function countColumns(row: string) {
  const cells = row
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "");

  return cells.replaceAll("\\|", "").split("|").length;
}

/**
 * 行が表の行かを判定する
 * @param line 判定する行
 * @returns | を含む空でない行の場合は true
 */
function isTableRow(line: string) {
  return line.includes("|") && line.trim() !== "";
}

/**
 * 見出し行と区切り行で、表が始まるかを判定する
 * 区切り行だけでは水平線と区別できないため、列数が見出し行と一致するときだけ表とする
 * @param headerLine 見出し行の候補
 * @param separatorLine 区切り行の候補。次の行がない場合は undefined
 * @returns 表が始まる場合は true
 */
function isTableStart(headerLine: string, separatorLine: string | undefined) {
  return (
    NON_CODE_INDENT_START.test(headerLine) &&
    headerLine.includes("|") &&
    separatorLine !== undefined &&
    TABLE_SEPARATOR.test(separatorLine) &&
    countColumns(headerLine) === countColumns(separatorLine)
  );
}

/**
 * 回答を、通常の部分と表に分ける
 * @param assistantMessage 回答の Markdown
 * @returns 回答の順に並んだ、通常テキストと表テキスト
 */
export function splitTablesFromAssistantMessage(assistantMessage: string) {
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
    const line = lines[index] ?? "";

    if (!isTableStart(line, lines[index + 1])) {
      plainLines.push(line);
      index += 1;
      continue;
    }

    let tableEnd = index + 2;

    while (tableEnd < lines.length && isTableRow(lines[tableEnd] ?? "")) {
      tableEnd += 1;
    }

    pushPlainPart();
    messageParts.push({
      kind: "table",
      tableText: lines.slice(index, tableEnd).join("\n"),
    });
    index = tableEnd;
  }

  pushPlainPart();

  return messageParts;
}
