import type { FsEntry } from "claude-code";

export type Entry = Pick<FsEntry, "name" | "kind">;

/**
 * ディレクトリの直下に、名前が一致するファイルがあるかを返す
 * @param entries ディレクトリの直下の項目
 * @param name ファイル名
 * @returns ある場合は true
 */
export function hasFile(entries: readonly Entry[], name: string) {
  return entries.some((entry) => entry.kind === "file" && entry.name === name);
}

/**
 * ディレクトリの直下に、名前が一致するフォルダがあるかを返す
 * @param entries ディレクトリの直下の項目
 * @param name フォルダ名
 * @returns ある場合は true
 */
export function hasFolder(entries: readonly Entry[], name: string) {
  return entries.some((entry) => entry.kind === "dir" && entry.name === name);
}

/**
 * ディレクトリの直下に、拡張子が一致するファイルがあるかを返す
 * @param entries ディレクトリの直下の項目
 * @param extension ドットを含まない拡張子
 * @returns ある場合は true
 */
export function hasExtension(entries: readonly Entry[], extension: string) {
  return entries.some(
    (entry) => entry.kind === "file" && entry.name.endsWith(`.${extension}`),
  );
}
