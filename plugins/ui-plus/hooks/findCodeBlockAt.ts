// ドメイン用語
// | 日本語         | 英語      | 定義                                                       |
// | -------------- | --------- | ---------------------------------------------------------- |
// | コードブロック | codeBlock | フェンス行で囲まれたコードのひとまとまり。フェンス行を含む |
// | フェンス行     | fenceLine | コードブロックを囲む行。開始と終了の2つがある              |
// | コード         | codeText  | コードブロックからフェンス行を除いた中身。コピーの対象     |

/**
 * 指定した行から始まるコードブロックの検出結果
 */
export interface CodeBlockMatch {
  /** フェンス行を含むコードブロックの行 */
  readonly codeBlockLines: string[];
  /** フェンス行を除いたコードの中身 */
  readonly codeText: string;
  /** 終了のフェンス行の1つ後ろの行の位置。呼び出し元が次に読む位置 */
  readonly nextIndex: number;
}

const OPENING_FENCE_LINE = /^ {0,3}(?:(`{3,})[^`]*|(~{3,}).*)$/;
const CLOSING_FENCE_LINE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * コードブロックの終了のフェンス行の位置を探す
 * 終了のフェンス行は、開始と同じ文字で、開始以上の長さの行
 * @param lines 回答の行
 * @param openingIndex 開始のフェンス行の位置
 * @param openingFence 開始のフェンス行のバッククォートまたはチルダの並び
 * @returns 終了のフェンス行の位置。閉じられていない場合は undefined
 */
function findClosingFenceIndex(
  lines: string[],
  openingIndex: number,
  openingFence: string,
) {
  for (let index = openingIndex + 1; index < lines.length; index += 1) {
    const closingFence = CLOSING_FENCE_LINE.exec(lines[index] ?? "")?.[1];

    if (
      closingFence !== undefined &&
      closingFence.startsWith(openingFence.charAt(0)) &&
      closingFence.length >= openingFence.length
    ) {
      return index;
    }
  }

  return undefined;
}

/**
 * 指定した行からコードブロックが始まる場合に、そのコードブロックを取り出す
 * 開始のフェンス行に書かれた言語は区別しない
 * 終了のフェンス行がない場合は、回答の最後までをコードブロックとする
 * @param lines 回答の行
 * @param index コードブロックが始まるかを調べる行の位置
 * @returns コードブロックの行とコードと次に読む行の位置。始まらない場合は undefined
 */
export function findCodeBlockAt(
  lines: string[],
  index: number,
): CodeBlockMatch | undefined {
  const opening = OPENING_FENCE_LINE.exec(lines[index] ?? "");
  const openingFence = opening?.[1] ?? opening?.[2];

  if (openingFence === undefined) {
    return undefined;
  }

  const closingIndex = findClosingFenceIndex(lines, index, openingFence);
  const nextIndex =
    closingIndex === undefined ? lines.length : closingIndex + 1;

  return {
    codeBlockLines: lines.slice(index, nextIndex),
    codeText: lines.slice(index + 1, closingIndex ?? lines.length).join("\n"),
    nextIndex,
  };
}
