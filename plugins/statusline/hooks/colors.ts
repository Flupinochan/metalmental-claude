// claude codeのtheme keyに別名を付けて再利用することで既存の配色と一致させる
// orangeを除き、基本的には新しいcolor codeは定義しない
// mod側で利用されていないtheme keyもあるが、後でcolorを重複して定義しないために残しておく
export const COLOR = {
  green: "success",
  blue: "planMode",
  indigo: "suggestion",
  yellow: "warning",
  red: "error",
  purple: "autoAccept",
  white: "inactive",
  grey: "text",
  black: "inverseText",
  orange: "#ff8700",
} as const;

const WARNING_PERCENT = 50;
const DANGER_PERCENT = 80;

/**
 * 使用率に対応する色を返す
 * 50%以上で yellow、80%以上で red、それ未満は green
 * @param percent 使用率 0から100
 * @returns テーマキーで表した色
 */
export function levelColor(percent: number) {
  if (percent >= DANGER_PERCENT) {
    return COLOR.red;
  }

  return percent >= WARNING_PERCENT ? COLOR.yellow : COLOR.green;
}
