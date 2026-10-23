import type { On } from "claude-code";
import type {
  ElementQuery,
  Engine,
  FoundElement,
  MockClock,
} from "claude-code/testing";
import { mock } from "claude-code/testing";

export const BAND = {
  plugin: "statusline",
  component: "AbovePrompt",
  requestId: "above-prompt",
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
  surface: "terminal",
} as const;

export const GIT_CLEAN =
  "# branch.oid x\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n";

export const GIT_MODIFIED = `${GIT_CLEAN}1 .M N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 f\n`;

export const file = (name: string) => ({ name, kind: "file" as const });
export const folder = (name: string) => ({ name, kind: "dir" as const });

const url = (number: number) => `https://github.com/o/r/pull/${number}`;

export const pullRequest = (
  number: number,
  state: "OPEN" | "CLOSED" | "MERGED",
  isDraft = false,
) => ({ number, state, url: url(number), isDraft });

export const pullRequestsJson = (
  ...pullRequests: ReturnType<typeof pullRequest>[]
) => JSON.stringify(pullRequests);

const RATE_LIMITS = [
  { kind: "five_hour", percentUsed: 12, resetsAt: "2026-10-24T05:30:00Z" },
  { kind: "seven_day", percentUsed: 40, resetsAt: "2026-10-30T05:30:00Z" },
];

/**
 * stub が返す、テストごとに書き換えられる世界の状態
 */
export type State = {
  cwd: string;
  branch: string;
  gitExitCode: number;
  gitStatus: string;
  gitDelayMs: number;
  pullRequests: string;
  pullRequestsExitCode: number;
  pullRequestsDelayMs: number;
  viewExitCode: number;
  viewStderr: string;
  modelId: string;
  outputStyle: unknown;
  ctxPercent: number | undefined;
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[];
  fill: { isFilled: boolean };
  copy:
    | { isCopied: true }
    | { isCopied: false; reason: "no-surface" | "no-clipboard" | "refused" };
  cwdFails: boolean;
  commandText: string;
  entries: { name: string; kind: "file" | "dir" }[];
  nodeStdout: string;
  nodeExitCode: number;
  nodeFails: boolean;
  virtualEnv: string | undefined;
  terraform: Record<
    string,
    { stdout?: string; exitCode?: number; fails?: boolean }
  >;
  rust: { stdout?: string; exitCode?: number; fails?: boolean };
  go: { stdout?: string; exitCode?: number; fails?: boolean };
  bun: { stdout?: string; exitCode?: number; fails?: boolean };
  python: Record<
    string,
    { stdout?: string; stderr?: string; exitCode?: number; fails?: boolean }
  >;
};

/**
 * stub が受けた呼び出しの記録
 */
export type Calls = {
  gitStatus: string[][];
  pullRequestList: { argv: string[]; timeoutMs: number | undefined }[];
  pullRequestView: string[][];
  fills: { text: string; mode: string }[];
  copies: { text: string; surface: string }[];
  terraformVersion: {
    argv: string[];
    cwd: string | undefined;
    timeoutMs: number | undefined;
    env: Record<string, string> | undefined;
  }[];
  bunVersion: {
    argv: string[];
    cwd: string | undefined;
    timeoutMs: number | undefined;
  }[];
  goVersion: {
    argv: string[];
    cwd: string | undefined;
    timeoutMs: number | undefined;
    env: Record<string, string> | undefined;
  }[];
  rustVersion: {
    argv: string[];
    cwd: string | undefined;
    timeoutMs: number | undefined;
    env: Record<string, string> | undefined;
  }[];
  pythonVersion: {
    argv: string[];
    cwd: string | undefined;
    timeoutMs: number | undefined;
  }[];
  nodeVersion: {
    argv: string[];
    cwd: string | undefined;
    timeoutMs: number | undefined;
  }[];
  logs: string[];
};

/**
 * 終了コードと出力から、process.run の stub の結果を作る
 * @param stdout 標準出力
 * @param exitCode 終了コード
 * @param stderr 標準エラー出力
 * @returns process.run の stub が返す値
 */
function ran(stdout: string, exitCode = 0, stderr = "") {
  return {
    value: {
      exitCode,
      stdout,
      stderr,
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  };
}

/**
 * すべての項目に値がある状態の世界を作る
 * @returns 既定の状態
 */
function defaultState(): State {
  return {
    cwd: "/home/x/proj",
    branch: "feature/x",
    gitExitCode: 0,
    gitStatus: GIT_CLEAN,
    gitDelayMs: 0,
    pullRequests: pullRequestsJson(pullRequest(12, "OPEN")),
    pullRequestsExitCode: 0,
    pullRequestsDelayMs: 0,
    viewExitCode: 0,
    viewStderr: "",
    modelId: "claude-opus-5-5[1m]",
    outputStyle: "Learning",
    ctxPercent: 42,
    rateLimits: RATE_LIMITS,
    fill: { isFilled: true },
    copy: { isCopied: true },
    cwdFails: false,
    commandText: "",
    entries: [file("package.json")],
    nodeStdout: "v22.1.0\n",
    nodeExitCode: 0,
    nodeFails: false,
    virtualEnv: undefined,
    terraform: { terraform: { stdout: "Terraform v1.9.5\non linux_amd64\n" } },
    rust: { stdout: "rustc 1.92.0 (ded5c06cf 2025-12-08)\n" },
    go: { stdout: "go version go1.25.0 linux/amd64\n" },
    bun: { stdout: "1.2.3\n" },
    python: {
      python: { fails: true },
      python3: { stdout: "Python 3.12.3\n" },
    },
  };
}

/**
 * Claude Code の代わりに答える stub をすべて登録する
 * stub は state を呼び出しのたびに読むため、テストの途中で state を書き換えられる
 * セッションの開始と時計の進行は行わない
 * @param on stub を登録する関数
 * @param overrides 既定の状態から変える項目
 * @returns 状態、呼び出しの記録、時計
 */
export function stubWorld(on: On, overrides: Partial<State> = {}) {
  const state: State = { ...defaultState(), ...overrides };
  const calls: Calls = {
    gitStatus: [],
    pullRequestList: [],
    pullRequestView: [],
    fills: [],
    copies: [],
    nodeVersion: [],
    pythonVersion: [],
    rustVersion: [],
    goVersion: [],
    bunVersion: [],
    terraformVersion: [],
    logs: [],
  };
  const clock: MockClock = mock.clock(on);

  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("turn.complete", () => ({ text: "" }));
  on("command.run", () => ({ text: state.commandText }));
  on("config.set", (_, e) => ({ value: e.value }));
  on("session.measure", (_, e) => ({ changed: e.changed }));
  on("classic.PostCompact", () => ({}));
  on("session.cwd", () =>
    state.cwdFails ? { deny: "cwd failed" } : { value: state.cwd },
  );
  on("session.model", () => ({ value: state.modelId }));
  on("settings.read", () => ({ value: { outputStyle: state.outputStyle } }));
  on("session.usage", () => ({
    value: {
      startedAt: 0,
      context: { tokens: 0, window: 200000, percent: state.ctxPercent },
      rateLimits: state.rateLimits,
    },
  }));
  on("fs.list", () => ({
    value: state.entries.map((entry) => ({
      ...entry,
      size: 0,
      mtimeMs: 0,
      isLink: false,
      as: "bytes" as const,
    })),
  }));
  on("env.get", (_, e) => ({
    value: e.name === "VIRTUAL_ENV" ? state.virtualEnv : undefined,
  }));
  on("process.run", async (_, e) => {
    if (e.argv[0] === "bun") {
      calls.bunVersion.push({
        argv: [...e.argv],
        cwd: e.init?.cwd,
        timeoutMs: e.init?.timeoutMs,
      });

      return state.bun.fails === true
        ? { deny: "spawn bun ENOENT" }
        : ran(state.bun.stdout ?? "", state.bun.exitCode ?? 0);
    }

    if (e.argv[0] === "terraform" || e.argv[0] === "tofu") {
      const command = e.argv[0];
      calls.terraformVersion.push({
        argv: [...e.argv],
        cwd: e.init?.cwd,
        timeoutMs: e.init?.timeoutMs,
        env: e.init?.env,
      });
      const outcome = state.terraform[command] ?? { fails: true };

      return outcome.fails === true
        ? { deny: `spawn ${command} ENOENT` }
        : ran(outcome.stdout ?? "", outcome.exitCode ?? 0);
    }

    if (e.argv[0] === "go") {
      calls.goVersion.push({
        argv: [...e.argv],
        cwd: e.init?.cwd,
        timeoutMs: e.init?.timeoutMs,
        env: e.init?.env,
      });

      return state.go.fails === true
        ? { deny: "spawn go ENOENT" }
        : ran(state.go.stdout ?? "", state.go.exitCode ?? 0);
    }

    if (e.argv[0] === "rustc") {
      calls.rustVersion.push({
        argv: [...e.argv],
        cwd: e.init?.cwd,
        timeoutMs: e.init?.timeoutMs,
        env: e.init?.env,
      });

      return state.rust.fails === true
        ? { deny: "spawn rustc ENOENT" }
        : ran(state.rust.stdout ?? "", state.rust.exitCode ?? 0);
    }

    if (e.argv[1] === "--version" && e.argv[0]?.startsWith("python")) {
      const command = e.argv[0];
      calls.pythonVersion.push({
        argv: [...e.argv],
        cwd: e.init?.cwd,
        timeoutMs: e.init?.timeoutMs,
      });
      const outcome = state.python[command] ?? { fails: true };

      return outcome.fails === true
        ? { deny: `spawn ${command} ENOENT` }
        : ran(
            outcome.stdout ?? "",
            outcome.exitCode ?? 0,
            outcome.stderr ?? "",
          );
    }

    if (e.argv[0] === "node") {
      calls.nodeVersion.push({
        argv: [...e.argv],
        cwd: e.init?.cwd,
        timeoutMs: e.init?.timeoutMs,
      });

      return state.nodeFails
        ? { deny: "spawn node ENOENT" }
        : ran(state.nodeStdout, state.nodeExitCode);
    }

    if (e.argv[0] === "gh" && e.argv[2] === "list") {
      calls.pullRequestList.push({
        argv: [...e.argv],
        timeoutMs: e.init?.timeoutMs,
      });

      if (state.pullRequestsDelayMs > 0) {
        await clock.sleep(state.pullRequestsDelayMs);
      }

      return ran(state.pullRequests, state.pullRequestsExitCode);
    }

    if (e.argv[0] === "gh" && e.argv[2] === "view") {
      calls.pullRequestView.push([...e.argv]);

      return ran("", state.viewExitCode, state.viewStderr);
    }

    if (e.argv.includes("--show-current")) {
      return ran(state.branch === "" ? "" : `${state.branch}\n`);
    }

    calls.gitStatus.push([...e.argv]);

    if (state.gitDelayMs > 0) {
      await clock.sleep(state.gitDelayMs);
    }

    return ran(state.gitStatus, state.gitExitCode);
  });
  on("prompt.fill", (_, e) => {
    calls.fills.push({ text: e.text, mode: e.mode ?? "" });

    return state.fill;
  });
  on("ui.copy", (_, e) => {
    calls.copies.push({ text: e.text, surface: e.surface ?? "" });

    return { value: state.copy };
  });
  on("ui.log", (_, e) => {
    calls.logs.push(e.text);

    return { value: undefined };
  });

  return { state, calls, clock };
}

/**
 * 世界を用意して、セッションを開始する
 * 時計は進めないため、PR の取得は始まっていない
 * @param $ テストキットのエンジン
 * @param on stub を登録する関数
 * @param overrides 既定の状態から変える項目
 * @returns 状態、呼び出しの記録、時計
 */
export async function startSession(
  $: Engine,
  on: On,
  overrides: Partial<State> = {},
) {
  const world = stubWorld(on, overrides);
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });

  return world;
}

/**
 * 世界を用意して、セッションを開始し、PR の取得まで終える
 * @param $ テストキットのエンジン
 * @param on stub を登録する関数
 * @param overrides 既定の状態から変える項目
 * @returns 状態、呼び出しの記録、時計
 */
export async function startLoadedSession(
  $: Engine,
  on: On,
  overrides: Partial<State> = {},
) {
  const world = await startSession($, on, overrides);
  await world.clock.advance(1);

  return world;
}

/**
 * メインエージェントまたはサブエージェントの応答の完了を通知する
 * @param $ テストキットのエンジン
 * @param agentId サブエージェントの id。メインの場合は指定しない
 * @returns turn.complete の結果
 */
export function completeTurn($: Engine, agentId?: string) {
  return $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t",
    reason: "answer",
    ...(agentId === undefined ? {} : { agentId }),
  });
}

/**
 * スラッシュコマンドの実行を通知する
 * @param $ テストキットのエンジン
 * @param command コマンド名
 * @returns command.run の結果
 */
export function runCommand($: Engine, command: string) {
  return $.command.run({
    command,
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: false, columns: 120 },
  });
}

/**
 * Claude Code が代わりに描画する要素の stub を登録する
 * フックが next(event) を返す描画では、この stub が必要
 * @param on stub を登録する関数
 */
export function stubStandardBand(on: On) {
  on("ui.render", () => ({
    type: "Text",
    props: {},
    children: ["標準の表示"],
  }));
}

type Mounted = {
  find: (query: ElementQuery) => Promise<FoundElement | undefined>;
  findAll: (query: ElementQuery) => Promise<FoundElement[]>;
};

/**
 * 描画された Text の表示文字列を、文書順に集める
 * @param ui 描画のハンドル
 * @returns Text の表示文字列
 */
export async function shownTexts(ui: Mounted) {
  const texts = await ui.findAll({ type: "Text" });

  return texts.map(({ text }) => text);
}

/**
 * 表示文字列に合う Text が描画されているかを返す
 * @param ui 描画のハンドル
 * @param text 表示文字列の条件
 * @returns 描画されている場合は true
 */
export async function isShown(ui: Mounted, text: string | RegExp) {
  return (await ui.find({ type: "Text", text })) !== undefined;
}

/**
 * 表示文字列に合う Text の色を返す
 * @param ui 描画のハンドル
 * @param text 表示文字列の条件
 * @returns 色。描画されていない場合は undefined
 */
export async function colorOf(ui: Mounted, text: string | RegExp) {
  return (await ui.find({ type: "Text", text }))?.props.color;
}
