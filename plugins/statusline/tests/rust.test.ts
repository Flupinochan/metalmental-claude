import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import {
  formatRustVersion,
  isRustProject,
  parseRustVersion,
} from "../hooks/rust";
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

const RUST_PROJECT = { entries: [file("Cargo.toml")] };

for (const name of ["Cargo.toml", "main.rs"]) {
  test(`RUST-1: ${name} があれば、対象にする`, () => {
    expect(isRustProject([file(name)])).toBe(true);
  });
}

for (const [name, entries] of [
  ["何もない", []],
  ["README.md だけがある", [file("README.md")]],
  ["Cargo.toml という名前のフォルダだけがある", [folder("Cargo.toml")]],
] as const) {
  test(`RUST-1: ${name}なら、対象にしない`, () => {
    expect(isRustProject(entries)).toBe(false);
  });
}

test("RUST-1: 対象でなければ、表示せず、rustc を実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^rust:/)).toBe(false);
  expect(calls.rustVersion).toHaveLength(0);
});

test("RUST-2: 出力 rustc 1.92.0 (…) から、2番目の語を版として取り出す", () => {
  expect(parseRustVersion("rustc 1.92.0 (ded5c06cf 2025-12-08)\n")).toBe(
    "1.92.0",
  );
  expect(parseRustVersion("rustc 1.93.0-nightly (abc 2026-01-01)")).toBe(
    "1.93.0-nightly",
  );
  expect(parseRustVersion("")).toBe("");
});

test("RUST-2: rust:版 の形で表示する", () => {
  expect(formatRustVersion("1.92.0")).toBe("rust:1.92.0");
});

test("RUST-2: 自動インストールを無効にして rustc --version を 3000ms で実行し、一番右に orange で表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    entries: [file("package.json"), file("pyproject.toml"), file("Cargo.toml")],
  });
  const ui = await $.ui.mount(BAND);
  const texts = await shownTexts(ui);

  expect(texts.slice(-3)).toEqual([
    "node:22.1.0",
    "python:3.12.3",
    "rust:1.92.0",
  ]);
  expect(await colorOf(ui, "rust:1.92.0")).toBe(COLOR.orange);
  expect(calls.rustVersion).toEqual([
    {
      argv: ["rustc", "--version"],
      cwd: "/home/x/proj",
      timeoutMs: 3000,
      env: { RUSTUP_AUTO_INSTALL: "0" },
    },
  ]);
});

test("RUST-3: 終了コードが 0 でなければ、表示しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...RUST_PROJECT,
    rust: { exitCode: 1 },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^rust:/)).toBe(false);
  expect(calls.logs).toEqual([]);
});

test("RUST-3: 起動できない場合は、表示せず、デバッグログに残す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...RUST_PROJECT,
    rust: { fails: true },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^rust:/)).toBe(false);
  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^rustc --version failed: /);
});

test("RUST-4: 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession($, on, RUST_PROJECT);
  await completeTurn($);
  await clock.advance(1);

  expect(calls.rustVersion).toHaveLength(1);

  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.rustVersion).toHaveLength(2);

  state.cwd = "/home/x/other";
  await completeTurn($);
  await clock.advance(1);

  expect(calls.rustVersion).toHaveLength(3);
  expect(calls.rustVersion[2]?.cwd).toBe("/home/x/other");
});

test("RUST-4: 作業ディレクトリが対象でなくなれば、表示しない", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on, RUST_PROJECT);
  state.entries = [];
  await completeTurn($);
  await clock.advance(1);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^rust:/)).toBe(false);
});
