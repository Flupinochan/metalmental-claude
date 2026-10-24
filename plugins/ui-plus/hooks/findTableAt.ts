// ドメイン用語
// | 日本語     | 英語          | 定義                                             |
// | ---------- | ------------- | ------------------------------------------------ |
// | 表         | table         | 見出し行、区切り行、表の行が続くひとまとまり     |
// | 表の文字列 | tableText     | 表の元の Markdown。コピーの対象                  |
// | 見出し行   | headerLine    | 表の1行目。列の名前が並ぶ                        |
// | 区切り行   | separatorLine | 表の2行目。--- が並ぶ                            |
// | 表の行     | row           | 表の中の1行 (見出し行、区切り行、データ行を含む) |
// | 列         | column        | 表の縦の区切り。縦線で区切られる                 |

/**
 * 指定した行から始まる表の検出結果
 */
export interface TableMatch {
  /** 表の元の Markdown */
  readonly tableText: string;
  /** 表の最後の行の、1つ後ろの行の位置。呼び出し元が次に読む位置 */
  readonly nextIndex: number;
}

const TABLE_SEPARATOR = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const NON_CODE_INDENT_START = /^ {0,3}\S/;

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
 * 指定した行から表が始まる場合に、その表を取り出す
 * 表の行は、空行か | のない行で終わる
 * @param lines 回答の行
 * @param index 表が始まるかを調べる行の位置
 * @returns 表の文字列と次に読む行の位置。表が始まらない場合は undefined
 */
export function findTableAt(
  lines: string[],
  index: number,
): TableMatch | undefined {
  if (!isTableStart(lines[index] ?? "", lines[index + 1])) {
    return undefined;
  }

  let tableEnd = index + 2;

  while (tableEnd < lines.length && isTableRow(lines[tableEnd] ?? "")) {
    tableEnd += 1;
  }

  return {
    tableText: lines.slice(index, tableEnd).join("\n"),
    nextIndex: tableEnd,
  };
}
