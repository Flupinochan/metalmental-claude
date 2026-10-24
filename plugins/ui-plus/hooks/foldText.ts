const HEADING_OR_LIST_MARKER = /^\s*(#+|[-*]|\d+\.)\s+/;
const INLINE_MARKER = /\*\*|__|`/g;

/**
 * 空でない行の数を返す
 * @param text 質問または回答の文章
 * @returns 空でない行の数
 */
export function countNonEmptyLines(text: string) {
  return text.split("\n").filter((line) => line.trim().length > 0).length;
}

/**
 * 空でない行が2行以上あるかを返す
 * @param text 質問または回答の文章
 * @returns 2行以上なら true。1行の文章は折りたたまない
 */
export function isMultiline(text: string) {
  return countNonEmptyLines(text) > 1;
}

/**
 * 折りたたんだときに表示する1行目を返す
 * 最初の空でない行から、見出し、箇条書き、強調、バッククォートの記号を外す
 * @param text 質問または回答の文章
 * @returns 記号を外した1行目。空でない行がなければ空文字
 */
export function firstLineOf(text: string) {
  const line = text.split("\n").find((one) => one.trim().length > 0) ?? "";

  return line
    .replace(HEADING_OR_LIST_MARKER, "")
    .replaceAll(INLINE_MARKER, "")
    .trim();
}
