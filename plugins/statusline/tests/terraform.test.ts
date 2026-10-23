import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import {
  formatTerraformVersion,
  isTerraformProject,
  parseTerraformVersion,
} from "../hooks/terraform";
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

const TERRAFORM_PROJECT = { entries: [file("main.tf")] };

for (const entry of [
  file("main.tf"),
  file("main.tofu"),
  file("plan.tfplan"),
  file("terraform.tfstate"),
  folder(".terraform"),
]) {
  test(`TF-1: ${entry.name} があれば、対象にする`, () => {
    expect(isTerraformProject([entry])).toBe(true);
  });
}

for (const [name, entries] of [
  ["何もない", []],
  ["package.json だけがある", [file("package.json")]],
  [".terraform という名前のファイルだけがある", [file(".terraform")]],
] as const) {
  test(`TF-1: ${name}なら、対象にしない`, () => {
    expect(isTerraformProject(entries)).toBe(false);
  });
}

test("TF-1: 対象でなければ、表示せず、terraform を実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^terraform:/)).toBe(false);
  expect(calls.terraformVersion).toHaveLength(0);
});

for (const [output, expected] of [
  ["Terraform v1.9.5\non linux_amd64\n", "1.9.5"],
  ["OpenTofu v1.7.2\n", "1.7.2"],
  ["Terraform v0.12.14-rc1\n", "0.12.14-rc1"],
  [
    "Terraform v0.12.13\n\nYour version of Terraform is out of date!\n",
    "0.12.13",
  ],
  ["", ""],
] as const) {
  test(`TF-2: ${JSON.stringify(output)} の版は「${expected}」`, () => {
    expect(parseTerraformVersion(output)).toBe(expected);
  });
}

test("TF-2: terraform:版 の形で表示する", () => {
  expect(formatTerraformVersion("1.9.5")).toBe("terraform:1.9.5");
});

test("TF-2: terraform version を 3000ms で、更新確認を無効にして実行し、一番右に indigo で表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    entries: [file("go.mod"), file("bun.lock"), file("main.tf")],
  });
  const ui = await $.ui.mount(BAND);
  const texts = await shownTexts(ui);

  expect(texts.at(-1)).toBe("terraform:1.9.5");
  expect(await colorOf(ui, "terraform:1.9.5")).toBe(COLOR.indigo);
  expect(calls.terraformVersion).toEqual([
    {
      argv: ["terraform", "version"],
      cwd: "/home/x/proj",
      timeoutMs: 3000,
      env: { CHECKPOINT_DISABLE: "1" },
    },
  ]);
});

test("TF-3: terraform が失敗したら、tofu の版を表示する", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...TERRAFORM_PROJECT,
    terraform: {
      terraform: { fails: true },
      tofu: { stdout: "OpenTofu v1.7.2\n" },
    },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "terraform:1.7.2")).toBe(true);
  expect(calls.terraformVersion.map(({ argv }) => argv[0])).toEqual([
    "terraform",
    "tofu",
  ]);
});

test("TF-3: terraform が成功したら、tofu は実行しない", async ($, on) => {
  const { calls } = await startLoadedSession($, on, TERRAFORM_PROJECT);

  expect(calls.terraformVersion).toHaveLength(1);
});

test("TF-3: 終了コードが 0 でなければ、次の候補を試す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...TERRAFORM_PROJECT,
    terraform: {
      terraform: { exitCode: 1 },
      tofu: { stdout: "OpenTofu v1.7.2\n" },
    },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, "terraform:1.7.2")).toBe(true);
  expect(calls.terraformVersion).toHaveLength(2);
});

test("TF-3: すべての候補が失敗したら、表示しない", async ($, on) => {
  await startLoadedSession($, on, {
    ...TERRAFORM_PROJECT,
    terraform: { terraform: { exitCode: 1 }, tofu: { fails: true } },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^terraform:/)).toBe(false);
});

test("TF-3: 起動できない場合は、表示せず、デバッグログに残す", async ($, on) => {
  const { calls } = await startLoadedSession($, on, {
    ...TERRAFORM_PROJECT,
    terraform: { terraform: { fails: true }, tofu: { fails: true } },
  });
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^terraform:/)).toBe(false);
  expect(
    calls.logs.filter((log) => log.includes("version failed")),
  ).toHaveLength(2);
});

test("TF-4: 版は作業ディレクトリごとに1回取得し、手動リロードで取り直す", async ($, on) => {
  const { state, calls, clock } = await startLoadedSession(
    $,
    on,
    TERRAFORM_PROJECT,
  );
  await completeTurn($);
  await clock.advance(1);

  expect(calls.terraformVersion).toHaveLength(1);

  const ui = await $.ui.mount(BAND);
  await ui.press({ key: "reload" });
  await clock.advance(1);

  expect(calls.terraformVersion).toHaveLength(2);

  state.cwd = "/home/x/other";
  await completeTurn($);
  await clock.advance(1);

  expect(calls.terraformVersion).toHaveLength(3);
  expect(calls.terraformVersion[2]?.cwd).toBe("/home/x/other");
});

test("TF-4: 作業ディレクトリが対象でなくなれば、表示しない", async ($, on) => {
  const { state, clock } = await startLoadedSession($, on, TERRAFORM_PROJECT);
  state.entries = [];
  await completeTurn($);
  await clock.advance(1);
  const ui = await $.ui.mount(BAND);

  expect(await isShown(ui, /^terraform:/)).toBe(false);
});
