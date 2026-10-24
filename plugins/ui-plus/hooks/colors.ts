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
