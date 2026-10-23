import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import {
  formatPythonVersion,
  isPythonProject,
  parsePythonVersion,
} from "../hooks/python";
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

const PYTHON_PROJECT = { entries: [file("pyproject.toml")] };

for (const name of [
  "requirements.txt",
  ".python-version",
  "pyproject.toml",
  "Pipfile",
  "tox.ini",
  "setup.py",
  "__init__.py",
  "main.py",
  "analysis.ipynb",
]) {
  test(`PY-1: ${name} があれば、対象にする`, () => {
    expect(isPythonProject([file(name)], undefined)).toBe(true);
  });
}

for (const [name, entries] of [
  ["何もない", []],
  ["README.md だけがある", [file("README.md")]],
  ["pyproject.toml という名前のフォルダだけがある", [folder("pyproject.toml")]],
] as const) {
  test(`PY-1: ${name}なら、対象にしない`, () => {
    expect(isPythonProject(entries, undefined)).toBe(false);
  });
}

test("PY-2: VIRTUAL_ENV が設定されていれば、ファイルがなくても対象にする", () => {
  expect(isPythonProject([], "/home/x/.venv")).toBe(true);
});

test("PY-3: 出力 Python 3.12.3 から、2番目の語を版として取り出す", () => {
  expect(parsePythonVersion("Python 3.12.3\n")).toBe("3.12.3");
  expect(parsePythonVersion("Python")).toBe("");
  expect(parsePythonVersion("")).toBe("");
});

test("PY-3: python:版 の形で表示する", () => {
  expect(formatPythonVersion("3.12.3")).toBe("python:3.12.3");
});

test("PY-3: python3 のみの環境では、python に失敗しても python3 の版を、node の右に yellow で表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    entries: [file("package.json"), file("pyproject.toml")],
  });
  const ui = await $.ui.mount(BAND);
  const texts = await shownTexts(ui);

  expect(texts.slice(-2)).toEqual(["node:22.1.0", "python:3.12.3"]);
  expect(await colorOf(ui, "python:3.12.3")).toBe(COLOR.yellow);
  expect(calls.pythonVersion).toEqual([
    { argv: ["python", "--version"], cwd: "/home/x/proj", timeoutMs: 3000 },
    { argv: ["python3", "--version"], cwd: "/home/x/proj", timeoutMs: 3000 },
  ]);
});

test("PY-3: 最初の候補が成功したら、次の候補は実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...PYTHON_PROJECT,
    python: { python: { stdout: "Python 3.11.9\n" } },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "python:3.11.9")).toBe(true);
  expect(calls.pythonVersion).toHaveLength(1);
});

test("PY-3: 標準出力が空なら、標準エラー出力から版を取り出す", async ($, on) => {
  await startLoadedSession($, on, {
    ...PYTHON_PROJECT,
    python: { python2: { stdout: "", stderr: "Python 2.7.18\n" } },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "python:2.7.18")).toBe(true);
});

test("PY-2: VIRTUAL_ENV だけでも、版を表示する", async ($, on) => {
  await startLoadedSession($, on, {
    entries: [],
    virtualEnv: "/home/x/.venv",
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "python:3.12.3")).toBe(true);
});

test("PY-1: 対象でなければ、表示せず、python を実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^python:/)).toBe(false);
  expect(calls.pythonVersion).toHaveLength(0);
});

test("PY-4: 終了コードが 0 でなければ、次の候補を試す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...PYTHON_PROJECT,
    python: {
      python: { exitCode: 1 },
      python3: { stdout: "Python 3.12.3\n" },
    },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "python:3.12.3")).toBe(true);
  expect(calls.logs).toEqual([]);
});

test("PY-4: 起動できなければ、次の候補を試し、デバッグログに残す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, PYTHON_PROJECT);

  expect(calls.logs).toHaveLength(1);
  expect(calls.logs[0]).toMatch(/^python --version failed: /);
});

test("PY-4: すべての候補が失敗したら、表示しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...PYTHON_PROJECT,
    python: {},
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^python:/)).toBe(false);
  expect(calls.pythonVersion).toHaveLength(3);
  expect(calls.logs).toHaveLength(3);
});

test("PY-5: 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession(
    $,
    on,
    PYTHON_PROJECT,
  );
  await completeTurn($);
  await clock.advance(1);
  const before = calls.pythonVersion.length;

  expect(before).toBe(2);

  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.pythonVersion).toHaveLength(before * 2);

  state.cwd = "/home/x/other";
  await completeTurn($);
  await clock.advance(1);

  expect(calls.pythonVersion).toHaveLength(before * 3);
  expect(calls.pythonVersion.at(-1)?.cwd).toBe("/home/x/other");
});

test("PY-5: 作業ディレクトリが対象でなくなれば、表示しない", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on, PYTHON_PROJECT);
  state.entries = [];
  await completeTurn($);
  await clock.advance(1);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^python:/)).toBe(false);
});
