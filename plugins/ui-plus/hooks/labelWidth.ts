// ボタンの外側の字下げ 2 と、折り返さないための余裕 2
export const ANSWER_TOGGLE_RESERVED = 4;
// 折り返さないための余裕 2
export const QUESTION_TOGGLE_RESERVED = 2;

// 行末の通常の空白は描画時に削られるため、削られないノーブレークスペースで埋める
const NO_BREAK_SPACE = " ";
const WIDE_RANGES = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
] as const;
const ZERO_WIDTH_RANGES = [
  [0x0300, 0x036f],
  [0x200b, 0x200d],
  [0xfe0f, 0xfe0f],
] as const;

/**
 * 符号位置が、範囲のどれかに含まれるかを返す
 * @param codePoint 文字の符号位置
 * @param ranges 先頭と末尾の符号位置の組
 * @returns 含まれるなら true
 */
function isInRanges(
  codePoint: number,
  ranges: readonly (readonly [number, number])[],
) {
  return ranges.some(
    ([first, last]) => codePoint >= first && codePoint <= last,
  );
}

/**
 * 端末での表示の幅を返す
 * 全角の文字と絵文字は2、結合文字と幅のない文字は0、それ以外は1と数える
 * @param text 幅を数える文字列
 * @returns 表示の幅 (桁数)
 */
export function displayWidthOf(text: string) {
  let width = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (isInRanges(codePoint, ZERO_WIDTH_RANGES)) {
      continue;
    }

    width += isInRanges(codePoint, WIDE_RANGES) ? 2 : 1;
  }

  return width;
}

/**
 * 文言の右側を、端末の横幅いっぱいになるまで埋める
 * 横幅が分からない場合と、文言が余白を除いた横幅を超える場合は、文言をそのまま返す
 * @param label ボタンの文言
 * @param columns 端末の桁数。分からない場合は undefined
 * @param reservedColumns 文言の外側で使う桁数と、折り返さないための余裕の合計
 * @returns 右側を埋めた文言
 */
export function padLabelToRight(
  label: string,
  columns: number | undefined,
  reservedColumns: number,
) {
  if (columns === undefined) {
    return label;
  }

  const shortage = columns - reservedColumns - displayWidthOf(label);

  return shortage > 0 ? label + NO_BREAK_SPACE.repeat(shortage) : label;
}
