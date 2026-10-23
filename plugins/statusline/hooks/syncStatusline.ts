import type { EngineInterface } from "claude-code";

import { syncCtx } from "./ctx";
import { syncGitStatus } from "./gitStatus";
import { syncModelId } from "./model";
import { syncOutputStyle } from "./outputStyle";
import { syncPullRequests } from "./pullRequest";
import { syncRateLimits } from "./rateLimits";
import { syncWorkingDirectory } from "./workingDirectory";

/**
 * 入力欄の上に表示するすべての値を、セッションの現在の値に更新する
 * PRは通信で遅いため、他の値を待たせないよう、結果を待たずにタイマーで取得する
 * @param $ engineのインターフェース
 */
export async function syncStatusline($: EngineInterface) {
  await Promise.all([
    syncWorkingDirectory($),
    syncGitStatus($),
    syncModelId($),
    syncOutputStyle($),
    syncCtx($),
    syncRateLimits($),
  ]);
  $.clock.after(0, () => syncPullRequests($));
}
