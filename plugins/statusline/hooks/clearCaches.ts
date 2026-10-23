import { clearBunVersionCache } from "./bun";
import { clearGoVersionCache } from "./go";
import { clearNodeVersionCache } from "./nodejs";
import { clearPullRequestCache } from "./pullRequest";
import { clearPythonVersionCache } from "./python";
import { clearRustVersionCache } from "./rust";
import { clearTerraformVersionCache } from "./terraform";

/**
 * このpluginが持つすべてのキャッシュを削除する
 * 次の同期では、キャッシュを使わず、最新の値を取得する
 * キャッシュを持つ機能が増えた場合は、ここに削除の呼び出しを足す
 */
export function clearCaches() {
  clearNodeVersionCache();
  clearPullRequestCache();
  clearPythonVersionCache();
  clearRustVersionCache();
  clearGoVersionCache();
  clearBunVersionCache();
  clearTerraformVersionCache();
}
