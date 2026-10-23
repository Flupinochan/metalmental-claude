import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import type { PullRequest, PullRequestState } from "../types";
import { COLOR } from "./colors";

const pullRequestsState = atom(
  { plugin: "statusline", key: "pullRequests" } as const,
  [],
);

const GITHUB_URL_PREFIX = "https://github.com/";
const PULL_REQUEST_TIMEOUT_MS = 5000;
const PULL_REQUEST_REFRESH_MS = 5 * 60 * 1000;
const PULL_REQUEST_RETRY_MS = 60 * 1000;

const PULL_REQUEST_COLORS = {
  OPEN: COLOR.green,
  DRAFT: COLOR.white,
  MERGED: COLOR.purple,
  CLOSED: COLOR.red,
} as const satisfies Record<PullRequestState, string>;

const PULL_REQUEST_PRIORITY = [
  "OPEN",
  "DRAFT",
  "MERGED",
  "CLOSED",
] as const satisfies readonly PullRequestState[];

type GhPullRequest = {
  readonly number: number;
  readonly state: Exclude<PullRequestState, "DRAFT">;
  readonly url: string;
  readonly isDraft: boolean;
};

/**
 * PRの取得の予定を管理する
 * 取得の対象、次に取得してよい時刻、取得中かどうかを持つ
 */
class PullRequestSchedule {
  #targetKey = "";
  #nextFetchAt = 0;
  #isFetching = false;

  /**
   * 取得を開始する
   * @returns 開始できた場合は true。すでに取得中の場合は false
   */
  startFetching() {
    if (this.#isFetching) {
      return false;
    }

    this.#isFetching = true;

    return true;
  }

  /**
   * 取得の終了を記録する
   */
  finishFetching() {
    this.#isFetching = false;
  }

  /**
   * 取得の対象を切り替える
   * 対象が変わった場合は、取得間隔をリセットする
   * @param targetKey 取得の対象を表すキー
   * @returns 対象が変わった場合は true
   */
  changeTarget(targetKey: string) {
    if (targetKey === this.#targetKey) {
      return false;
    }

    this.#targetKey = targetKey;
    this.#nextFetchAt = 0;

    return true;
  }

  /**
   * 取得してよい時刻になっているかを判定する
   * @param now 現在時刻 ミリ秒
   * @returns 取得してよい場合は true
   */
  isDue(now: number) {
    return now >= this.#nextFetchAt;
  }

  /**
   * 次の取得を、成功時の間隔の後に予定する
   * @param now 現在時刻 ミリ秒
   */
  scheduleRefresh(now: number) {
    this.#nextFetchAt = now + PULL_REQUEST_REFRESH_MS;
  }

  /**
   * 次の取得を、失敗時の間隔の後に予定する
   * @param now 現在時刻 ミリ秒
   */
  scheduleRetry(now: number) {
    this.#nextFetchAt = now + PULL_REQUEST_RETRY_MS;
  }

  /**
   * 取得間隔をリセットし、次の取得を待たせない
   */
  resetInterval() {
    this.#nextFetchAt = 0;
  }
}

// 取得の制御に使うだけで描画には使わないため、$.state ではなくモジュールの定数に持つ
const pullRequestSchedule = new PullRequestSchedule();

/**
 * gh prの1件を、表示用のPRデータに変える
 * OPENでドラフトのものは DRAFT とする
 * @param ghPullRequest gh pr list の1件
 * @returns 表示用のPR
 */
function toPullRequest({
  number,
  state,
  url,
  isDraft,
}: GhPullRequest): PullRequest {
  return { number, url, state: state === "OPEN" && isDraft ? "DRAFT" : state };
}

/**
 * gh pr list の出力から、表示するPRを選ぶ
 * OPEN、DRAFT、MERGED、CLOSED の優先順で、同じ状態なら番号が大きいものを1件選ぶ
 * 開くURLになるため、GitHubのURLのみを対象にする
 * @param stdout gh pr list --json の出力。壊れている場合は例外
 * @returns 表示するPRの配列。PRが無い場合は空配列、ある場合は1件
 */
function pickPullRequests(stdout: string) {
  const ghPullRequests: GhPullRequest[] = JSON.parse(stdout);

  return ghPullRequests
    .filter(({ url }) => url.startsWith(GITHUB_URL_PREFIX))
    .map(toPullRequest)
    .sort(
      (a, b) =>
        PULL_REQUEST_PRIORITY.indexOf(a.state) -
          PULL_REQUEST_PRIORITY.indexOf(b.state) || b.number - a.number,
    )
    .slice(0, 1);
}

/**
 * 作業ディレクトリの現在のブランチ名を取得する
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @returns ブランチ名。gitリポジトリ外、detached HEAD、コミット前の場合は空文字
 */
async function getCurrentBranch($: EngineInterface, cwd: string) {
  const ran = await $.process.run([
    "git",
    "--no-optional-locks",
    "-C",
    cwd,
    "branch",
    "--show-current",
  ]);

  return ran.exitCode === 0 ? ran.stdout.trim() : "";
}

/**
 * ブランチに紐づくPRを、ghで取得し、表示する分だけに絞る
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @param branch ブランチ名
 * @returns 表示するPR。ghが失敗した場合は例外
 */
async function fetchPullRequestsToShow(
  $: EngineInterface,
  cwd: string,
  branch: string,
) {
  const ran = await $.process.run(
    [
      "gh",
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "all",
      "--json",
      "number,state,url,isDraft",
    ],
    { cwd, timeoutMs: PULL_REQUEST_TIMEOUT_MS },
  );

  if (ran.exitCode !== 0) {
    throw new Error("gh pr list failed");
  }

  return pickPullRequests(ran.stdout);
}

/**
 * PRを、表示用の項目へ変換する
 * 表示は PR #番号、色は状態ごと
 * @param pullRequests 保存済みのPR
 * @returns 項目ごとの number、url、text、color
 */
export function summarizePullRequests(pullRequests: readonly PullRequest[]) {
  return pullRequests.map(({ number, state, url }) => ({
    number,
    url,
    text: `PR #${number}`,
    color: PULL_REQUEST_COLORS[state],
  }));
}

/**
 * 保存済みのPRを読む
 * 描画の中で呼ぶと、syncPullRequests による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みのPR。無い場合は空配列
 */
export function readPullRequests($: EngineInterface) {
  return read($, pullRequestsState);
}

/**
 * PRをブラウザで開く
 * OSごとのブラウザの起動は gh に任せる
 * @param $ engineのインターフェース
 * @param url 開くPRのURL
 */
export async function openPullRequest($: EngineInterface, url: string) {
  try {
    const ran = await $.process.run(["gh", "pr", "view", url, "--web"]);

    if (ran.exitCode !== 0) {
      $.ui.log(`gh pr view failed: ${ran.stderr.trim()}`, { to: "debug" });
    }
  } catch (error) {
    $.ui.log(`gh pr view failed: ${String(error)}`, { to: "debug" });
  }
}

/**
 * PRの取得間隔のキャッシュを削除する
 * 次の syncPullRequests では、間隔によらず取得する
 */
export function clearPullRequestCache() {
  pullRequestSchedule.resetInterval();
}

/**
 * 現在のブランチのPRを取得し、保存済みの値を更新する
 * ブランチが変わったときは、前のブランチのPRを消す
 * 5分以内の再取得はせず、失敗した場合は60秒後まで再取得しない。この間隔は clearPullRequestCache で取り消せる
 * @param $ engineのインターフェース
 */
export async function syncPullRequests($: EngineInterface) {
  if (!pullRequestSchedule.startFetching()) {
    return;
  }

  try {
    const cwd = await $.session.cwd();
    const branch = await getCurrentBranch($, cwd);

    if (pullRequestSchedule.changeTarget(`${cwd}\n${branch}`)) {
      await update($, pullRequestsState, () => []);
    }

    if (branch === "" || !pullRequestSchedule.isDue(await $.clock.now())) {
      return;
    }

    const pullRequests = await fetchPullRequestsToShow($, cwd, branch);
    await update($, pullRequestsState, () => pullRequests);
    pullRequestSchedule.scheduleRefresh(await $.clock.now());
  } catch (error) {
    $.ui.log(`pull request sync failed: ${String(error)}`, { to: "debug" });
    pullRequestSchedule.scheduleRetry(await $.clock.now());
  } finally {
    pullRequestSchedule.finishFetching();
  }
}
