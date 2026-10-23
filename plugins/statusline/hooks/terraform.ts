// starship参考
// https://github.com/starship/starship/blob/main/src/modules/terraform.rs
import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";

import { VERSION_COMMAND_TIMEOUT_MS } from "./commandTimeout";
import type { Entry } from "./directoryEntries";
import { hasExtension, hasFolder } from "./directoryEntries";

const terraformVersionState = atom(
  { plugin: "statusline", key: "terraformVersion" } as const,
  "",
);

const TERRAFORM_COMMANDS = ["terraform", "tofu"];
const DETECT_FOLDERS = [".terraform"];
const DETECT_EXTENSIONS = ["tf", "tofu", "tfplan", "tfstate"];

// 取得の制御に使うだけで描画には使わないため、$.state ではなくモジュールの変数に持つ
let versionCache = { cwd: "", version: "" };

/**
 * ディレクトリの直下の内容が、Terraform のプロジェクトかを判定する
 * @param entries ディレクトリの直下の項目
 * @returns Terraform のプロジェクトの場合は true
 */
export function isTerraformProject(entries: readonly Entry[]) {
  return (
    DETECT_FOLDERS.some((name) => hasFolder(entries, name)) ||
    DETECT_EXTENSIONS.some((name) => hasExtension(entries, name))
  );
}

/**
 * terraform version の出力の1行目から、Terraform または OpenTofu と先頭の v を除いた版を取り出す
 * 2行目以降には、更新の案内などが付くことがある
 * @param output terraform version の標準出力
 * @returns 版。取り出せない場合は空文字
 */
export function parseTerraformVersion(output: string) {
  return (output.split("\n")[0] ?? "")
    .replace(/^(Terraform|OpenTofu) /, "")
    .trim()
    .replace(/^v/, "");
}

/**
 * Terraform の版を表示用の文字列に整形する
 * @param version 版
 * @returns 整形後の文字列
 */
export function formatTerraformVersion(version: string) {
  return `terraform:${version}`;
}

/**
 * Terraform の版のキャッシュを削除する
 * 次の syncTerraformVersion では、キャッシュを使わず、terraform を実行して取得する
 */
export function clearTerraformVersionCache() {
  versionCache = { cwd: "", version: "" };
}

/**
 * 作業ディレクトリで version を実行し、最初に成功したコマンドの版を取得する
 * @param $ engineのインターフェース
 * @param cwd 作業ディレクトリ
 * @returns 版。すべての候補が失敗した場合は空文字
 */
async function fetchTerraformVersion($: EngineInterface, cwd: string) {
  for (const command of TERRAFORM_COMMANDS) {
    try {
      // 更新の確認で外部へ通信するため、無効にする
      const ran = await $.process.run([command, "version"], {
        cwd,
        timeoutMs: VERSION_COMMAND_TIMEOUT_MS,
        env: { CHECKPOINT_DISABLE: "1" },
      });

      if (ran.exitCode === 0) {
        return parseTerraformVersion(ran.stdout);
      }
    } catch (error) {
      $.ui.log(`${command} version failed: ${String(error)}`, {
        to: "debug",
      });
    }
  }

  return "";
}

/**
 * 保存済みの Terraform の版を読む
 * 描画の中で呼ぶと、syncTerraformVersion による更新時に再描画される
 * @param $ engineのインターフェース
 * @returns 保存済みの版。Terraform のプロジェクトでない間や、取得できない間は空文字
 */
export function readTerraformVersion($: EngineInterface) {
  return read($, terraformVersionState);
}

/**
 * 作業ディレクトリの Terraform の版を取得し、保存済みの値を更新する
 * 版は作業ディレクトリごとに1回だけ取得し、プロジェクトでない場合は terraform を実行しない
 * @param $ engineのインターフェース
 */
export async function syncTerraformVersion($: EngineInterface) {
  const cwd = await $.session.cwd();
  const entries = await $.fs.list(cwd);

  if (!isTerraformProject(entries)) {
    await update($, terraformVersionState, () => "");

    return;
  }

  if (versionCache.cwd !== cwd) {
    versionCache = { cwd, version: await fetchTerraformVersion($, cwd) };
  }

  await update($, terraformVersionState, () => versionCache.version);
}
