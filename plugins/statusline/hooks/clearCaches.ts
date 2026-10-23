import { clearPullRequestCache } from "./pullRequest";

/**
 * このpluginが持つすべてのキャッシュを削除する
 * 次の同期では、キャッシュを使わず、最新の値を取得する
 * キャッシュを持つ機能が増えた場合は、ここに削除の呼び出しを足す
 */
export function clearCaches() {
  clearPullRequestCache();
}
