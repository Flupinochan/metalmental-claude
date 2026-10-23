import { expect, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { summarizePullRequests } from "../hooks/pullRequest";
import {
  BAND,
  colorOf,
  completeTurn,
  pullRequest,
  pullRequestsJson,
  shownTexts,
  startLoadedSession,
  startSession,
} from "./helpers";

const shownPullRequests = async (ui: Parameters<typeof shownTexts>[0]) =>
  (await shownTexts(ui)).filter((text) => text.startsWith("PR #"));

const turn = async (
  $: Engine,
  clock: { advance: (ms: number) => Promise<void> },
) => {
  await completeTurn($);
  await clock.advance(1);
};

for (const [state, expected] of [
  ["OPEN", "green"],
  ["DRAFT", "white"],
  ["MERGED", "purple"],
  ["CLOSED", "red"],
] as const) {
  test(`PR-1: ${state} は PR #番号 を ${expected} で表示する`, () => {
    expect(
      summarizePullRequests([
        { number: 12, state, url: "https://github.com/o/r/pull/12" },
      ]),
    ).toEqual([
      {
        number: 12,
        url: "https://github.com/o/r/pull/12",
        text: "PR #12",
        color: COLOR[expected],
      },
    ]);
  });
}

test("PR-2: 現在のブランチの PR を gh pr list で取得して表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);

  expect(await shownPullRequests(ui)).toEqual(["PR #12"]);
  expect(calls.pullRequestList).toEqual([
    {
      argv: [
        "gh",
        "pr",
        "list",
        "--head",
        "feature/x",
        "--state",
        "all",
        "--json",
        "number,state,url,isDraft",
      ],
      timeoutMs: 5000,
    },
  ]);
});

test("PR-2: PR がなければ、表示しない", async ($, on) => {
  await startLoadedSession($, on, { pullRequests: "[]" });
  const ui = await $.ui.mount(BAND);

  expect(await shownPullRequests(ui)).toEqual([]);
});

for (const [name, pullRequests, expected] of [
  [
    "OPEN は DRAFT より優先する",
    [pullRequest(13, "OPEN", true), pullRequest(12, "OPEN")],
    "PR #12",
  ],
  [
    "MERGED は CLOSED より優先する",
    [pullRequest(21, "CLOSED"), pullRequest(20, "MERGED")],
    "PR #20",
  ],
  [
    "同じ状態なら、番号が大きいものを表示する",
    [pullRequest(12, "OPEN"), pullRequest(13, "OPEN")],
    "PR #13",
  ],
] as const) {
  test(`PR-3: ${name}`, async ($, on) => {
    await startLoadedSession($, on, {
      pullRequests: pullRequestsJson(...pullRequests),
    });
    const ui = await $.ui.mount(BAND);

    expect(await shownPullRequests(ui)).toEqual([expected]);
  });
}

test("PR-4: OPEN でドラフトのものは DRAFT として white で表示する", async ($, on) => {
  await startLoadedSession($, on, {
    pullRequests: pullRequestsJson(pullRequest(12, "OPEN", true)),
  });
  const ui = await $.ui.mount(BAND);

  expect(await colorOf(ui, "PR #12")).toBe(COLOR.white);
});

test("PR-5: GitHub 以外の URL は対象にしない", async ($, on) => {
  await startLoadedSession($, on, {
    pullRequests: JSON.stringify([
      { ...pullRequest(12, "OPEN"), url: "https://evil.example/pull/12" },
    ]),
  });
  const ui = await $.ui.mount(BAND);

  expect(await shownPullRequests(ui)).toEqual([]);
});

test("PR-6: ブランチ名が空なら、gh を呼ばない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, { branch: "" });

  expect(calls.pullRequestList).toHaveLength(0);
});

test("PR-7: 成功後 5 分間は再取得しない", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on);
  await turn($, clock);

  expect(calls.pullRequestList).toHaveLength(1);

  await clock.advance(5 * 60 * 1000);
  await turn($, clock);

  expect(calls.pullRequestList).toHaveLength(2);
});

test("PR-8: 失敗後 60 秒間は再取得せず、失敗をデバッグログに残す", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on, {
    pullRequestsExitCode: 1,
  });

  expect(calls.pullRequestList).toHaveLength(1);
  expect(calls.logs).toEqual([
    "pull request sync failed: Error: gh pr list failed",
  ]);

  await clock.advance(30 * 1000);
  await turn($, clock);

  expect(calls.pullRequestList).toHaveLength(1);

  await clock.advance(31 * 1000);
  await turn($, clock);

  expect(calls.pullRequestList).toHaveLength(2);
});

test("PR-8: JSON が壊れていても失敗として扱う", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    pullRequests: "not json",
  });
  const ui = await $.ui.mount(BAND);

  expect(await shownPullRequests(ui)).toEqual([]);
  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^pull request sync failed: /);
});

test("PR-8: 失敗しても、前回の PR は表示したまま残す", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on);
  state.pullRequestsExitCode = 1;
  await clock.advance(5 * 60 * 1000);
  await turn($, clock);
  const ui = await $.ui.mount(BAND);

  expect(await shownPullRequests(ui)).toEqual(["PR #12"]);
});

test("PR-9: ブランチが変わったら、前の PR を消す", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on);
  state.branch = "other";
  state.pullRequestsExitCode = 1;
  await turn($, clock);
  const ui = await $.ui.mount(BAND);

  expect(await shownPullRequests(ui)).toEqual([]);
});

test("PR-10: 手動リロードでは、間隔によらず取得する", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.pullRequestList).toHaveLength(2);
});

test("PR-11: 取得中の呼び出しは、無視する", async ($, on) => {
  const { calls, clock } = await startSession($, on, {
    pullRequestsDelayMs: 100,
  });
  await clock.advance(1);
  await turn($, clock);

  expect(calls.pullRequestList).toHaveLength(1);

  await clock.advance(200);

  expect(calls.pullRequestList).toHaveLength(1);
});

test("PR-12: PR を押すと、gh pr view <url> --web を実行する", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "pull-request-12" });

  expect(calls.pullRequestView).toEqual([
    ["gh", "pr", "view", "https://github.com/o/r/pull/12", "--web"],
  ]);
});

test("PR-12: gh pr view が失敗したら、デバッグログに残す", async ($, on) => {
  const { calls, clock } = await startLoadedSession($, on, {
    viewExitCode: 1,
    viewStderr: "boom\n",
  });
  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "pull-request-12" });
  await clock.advance(1);

  expect(calls.logs).toEqual(["gh pr view failed: boom"]);
});
