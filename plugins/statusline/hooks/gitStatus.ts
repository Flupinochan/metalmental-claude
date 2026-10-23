import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import type { GitStatus } from "../types";
import { COLOR } from "./colors";

const gitStatusState = atom(
  { plugin: "statusline", key: "gitStatus" } as const,
  undefined,
);

const GIT_STATUS_COLORS = {
  unpushed: COLOR.red,
  uncommitted: COLOR.red,
  clean: COLOR.green,
  "no-git": COLOR.blue,
} as const satisfies Record<GitStatus, string>;

const AHEAD_OF_UPSTREAM = /^\+[1-9]/;
const INITIAL_COMMIT = "(initial)";
const DETACHED_HEAD = "(detached)";

/**
 * git status --porcelain=v2 --branch が出力する、ブランチの情報の項目名
 */
type BranchHeaderKey = "oid" | "head" | "upstream" | "ab";

/**
 * gitの状態に対応する色を返す
 * unpushed と uncommitted は red、clean は green、no-git は blue
 * @param gitStatus gitの状態
 * @returns テーマキーで表した色
 */
export function gitStatusColor(gitStatus: GitStatus) {
  return GIT_STATUS_COLORS[gitStatus];
}

/**
 * git status --porcelain=v2 --branch の出力から、ブランチの情報の行の値を取り出す
 * @param lines 出力の各行
 * @param key 項目名。例: head、upstream、ab
 * @returns 値。該当する行がない場合は undefined
 */
function branchHeaderValue(lines: readonly string[], key: BranchHeaderKey) {
  const prefix = `# branch.${key} `;

  return lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
}

/**
 * 未プッシュのコミットがあるかを、ブランチの情報から判定する
 * プッシュ対象があり、上流がないか、上流より先行している場合に該当する
 * @param lines git status --porcelain=v2 --branch の出力の各行
 * @returns 未プッシュのコミットがある場合は true
 */
function hasUnpushedCommits(lines: readonly string[]) {
  const hasNothingToPush =
    branchHeaderValue(lines, "oid") === INITIAL_COMMIT ||
    branchHeaderValue(lines, "head") === DETACHED_HEAD;
  const hasUpstream = branchHeaderValue(lines, "upstream") !== undefined;
  const isAhead = AHEAD_OF_UPSTREAM.test(branchHeaderValue(lines, "ab") ?? "");

  return !hasNothingToPush && (!hasUpstream || isAhead);
}

/**
 * git status の結果から、gitの状態を1つに決める
 * 優先順位は、unpushed、uncommitted、clean の順。コマンドが失敗した場合は no-git
 * @param exitCode git status の終了コード
 * @param stdout git status --porcelain=v2 --branch の出力
 * @returns gitの状態
 */
function classifyGitStatus(exitCode: number, stdout: string): GitStatus {
  if (exitCode !== 0) {
    return "no-git";
  }

  const lines = stdout.split("\n").filter((line) => line.length > 0);

  if (hasUnpushedCommits(lines)) {
    return "unpushed";
  }

  const hasChanges = lines.some((line) => !line.startsWith("#"));

  return hasChanges ? "uncommitted" : "clean";
}

/**
 * 保存済みのgitの状態を読む
 * 描画の中で呼ぶと、syncGitStatus による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みのgitの状態。未取得の間は undefined
 */
export function readGitStatus($: EngineInterface) {
  return read($, gitStatusState);
}

/**
 * 作業ディレクトリのgitの状態を取得し、保存済みの値を更新する
 * @param $ engineのインターフェース
 */
export async function syncGitStatus($: EngineInterface) {
  const cwd = await $.session.cwd();
  const ran = await $.process.run([
    "git",
    "--no-optional-locks",
    "-C",
    cwd,
    "status",
    "--porcelain=v2",
    "--branch",
  ]);
  await update($, gitStatusState, () =>
    classifyGitStatus(ran.exitCode, ran.stdout),
  );
}
