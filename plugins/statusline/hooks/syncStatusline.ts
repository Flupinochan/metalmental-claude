import type { EngineInterface } from "claude-code";

import { syncBunVersion } from "./bun";
import { syncCtx } from "./ctx";
import { syncGitStatus } from "./gitStatus";
import { syncGoVersion } from "./go";
import { syncModelId } from "./model";
import { syncNodeVersion } from "./nodejs";
import { syncOutputStyle } from "./outputStyle";
import { syncPullRequests } from "./pullRequest";
import { syncPythonVersion } from "./python";
import { syncRateLimits } from "./rateLimits";
import { syncRustVersion } from "./rust";
import { syncTerraformVersion } from "./terraform";
import { syncWorkingDirectory } from "./workingDirectory";

/**
 * 入力欄の上に表示するすべての値を、セッションの現在の値に更新する
 * PRは通信で遅いため、他の値を待たせないよう、結果を待たずにタイマーで取得する
 * @param $ engineのインターフェース
 */
export async function syncStatusline($: EngineInterface) {
  await Promise.all([
    syncWorkingDirectory($),
    syncNodeVersion($),
    syncPythonVersion($),
    syncRustVersion($),
    syncGoVersion($),
    syncBunVersion($),
    syncTerraformVersion($),
    syncGitStatus($),
    syncModelId($),
    syncOutputStyle($),
    syncCtx($),
    syncRateLimits($),
  ]);
  $.clock.after(0, () => syncPullRequests($));
}
