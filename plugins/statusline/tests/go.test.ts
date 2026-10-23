import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { formatGoVersion, isGoProject, parseGoVersion } from "../hooks/go";
import {
  BAND,
  colorOf,
  completeTurn,
  file,
  folder,
  isShown,
  shownTexts,
  startLoadedSession,
} from "./helpers";

const GO_PROJECT = { entries: [file("go.mod")] };

for (const entry of [
  file("go.mod"),
  file("go.sum"),
  file("go.work"),
  file("glide.yaml"),
  file("Gopkg.yml"),
  file("Gopkg.lock"),
  file(".go-version"),
  file("main.go"),
  folder("Godeps"),
]) {
  test(`GO-1: ${entry.name} があれば、対象にする`, () => {
    expect(isGoProject([entry])).toBe(true);
  });
}

for (const [name, entries] of [
  ["何もない", []],
  ["README.md だけがある", [file("README.md")]],
  ["go.mod という名前のフォルダだけがある", [folder("go.mod")]],
  ["Godeps という名前のファイルだけがある", [file("Godeps")]],
] as const) {
  test(`GO-1: ${name}なら、対象にしない`, () => {
    expect(isGoProject(entries)).toBe(false);
  });
}

test("GO-1: 対象でなければ、表示せず、go を実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^go:/)).toBe(false);
  expect(calls.goVersion).toHaveLength(0);
});

test("GO-2: 出力 go version go1.25.0 linux/amd64 から、go の後ろの版を取り出す", () => {
  expect(parseGoVersion("go version go1.25.0 linux/amd64\n")).toBe("1.25.0");
  expect(parseGoVersion("go version go1.21rc2 darwin/arm64")).toBe("1.21rc2");
  expect(parseGoVersion("go version devel go1.26-abc linux/amd64")).toBe("");
  expect(parseGoVersion("")).toBe("");
});

test("GO-2: go:版 の形で表示する", () => {
  expect(formatGoVersion("1.25.0")).toBe("go:1.25.0");
});

test("GO-2: 自動ダウンロードを無効にして go version を 3000ms で実行し、一番右に blue で表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    entries: [
      file("package.json"),
      file("pyproject.toml"),
      file("Cargo.toml"),
      file("go.mod"),
    ],
  });
  const ui = await $.ui.mount(BAND);
  const texts = await shownTexts(ui);

  expect(texts.slice(-4)).toEqual([
    "node:22.1.0",
    "python:3.12.3",
    "rust:1.92.0",
    "go:1.25.0",
  ]);
  expect(await colorOf(ui, "go:1.25.0")).toBe(COLOR.blue);
  expect(calls.goVersion).toEqual([
    {
      argv: ["go", "version"],
      cwd: "/home/x/proj",
      timeoutMs: 3000,
      env: { GOTOOLCHAIN: "local" },
    },
  ]);
});

test("GO-3: 終了コードが 0 でなければ、表示しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...GO_PROJECT,
    go: { exitCode: 1 },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^go:/)).toBe(false);
  expect(calls.logs).toEqual([]);
});

test("GO-3: 起動できない場合は、表示せず、デバッグログに残す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...GO_PROJECT,
    go: { fails: true },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^go:/)).toBe(false);
  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^go version failed: /);
});

test("GO-4: 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession($, on, GO_PROJECT);
  await completeTurn($);
  await clock.advance(1);

  expect(calls.goVersion).toHaveLength(1);

  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.goVersion).toHaveLength(2);

  state.cwd = "/home/x/other";
  await completeTurn($);
  await clock.advance(1);

  expect(calls.goVersion).toHaveLength(3);
  expect(calls.goVersion[2]?.cwd).toBe("/home/x/other");
});

test("GO-4: 作業ディレクトリが対象でなくなれば、表示しない", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on, GO_PROJECT);
  state.entries = [];
  await completeTurn($);
  await clock.advance(1);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^go:/)).toBe(false);
});
