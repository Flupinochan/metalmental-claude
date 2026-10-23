import { expect, test } from "claude-code/testing";

import { COLOR } from "../hooks/colors";
import { gitStatusColor } from "../hooks/gitStatus";
import { BAND, GIT_CLEAN, isShown, startLoadedSession } from "./helpers";

// 出力は、実際のgitで状態を作って取得した git status --porcelain=v2 --branch
const CASES = [
  {
    name: "unborn",
    label: "clean",
    stdout: "# branch.oid (initial)\n# branch.head main\n",
  },
  {
    name: "unborn + untracked",
    label: "uncommitted",
    stdout: "# branch.oid (initial)\n# branch.head main\n? u\n",
  },
  {
    name: "clean",
    label: "clean",
    stdout:
      "# branch.oid 06b8a54e0d568b6bb0e5ccb685364d047005dcf3\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n",
  },
  {
    name: "modified",
    label: "uncommitted",
    stdout:
      "# branch.oid 06b8a54e0d568b6bb0e5ccb685364d047005dcf3\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n1 .M N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 f\n",
  },
  {
    name: "staged",
    label: "uncommitted",
    stdout:
      "# branch.oid 06b8a54e0d568b6bb0e5ccb685364d047005dcf3\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n1 M. N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 422c2b7ab3b3c668038da977e4e93a5fc623169c f\n",
  },
  {
    name: "staged + untracked",
    label: "uncommitted",
    stdout:
      "# branch.oid 06b8a54e0d568b6bb0e5ccb685364d047005dcf3\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n1 M. N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 422c2b7ab3b3c668038da977e4e93a5fc623169c f\n? g\n",
  },
  {
    name: "renamed",
    label: "uncommitted",
    stdout:
      "# branch.oid 06b8a54e0d568b6bb0e5ccb685364d047005dcf3\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n2 R. N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 422c2b7ab3b3c668038da977e4e93a5fc623169c R50 f2\tf\n? g\n",
  },
  {
    name: "ahead 1",
    label: "unpushed",
    stdout:
      "# branch.oid 25bfaef53967fe41ca76b681a7ed3faeccc132c7\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -0\n",
  },
  {
    name: "ahead 1 + modified",
    label: "unpushed",
    stdout:
      "# branch.oid 25bfaef53967fe41ca76b681a7ed3faeccc132c7\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -0\n1 .M N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 f\n",
  },
  {
    name: "behind 1",
    label: "clean",
    stdout:
      "# branch.oid 25bfaef53967fe41ca76b681a7ed3faeccc132c7\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -1\n",
  },
  {
    name: "no upstream",
    label: "unpushed",
    stdout:
      "# branch.oid 4c5173bb9f894988dc317093eea21134f0f8a680\n# branch.head newbranch\n",
  },
  {
    name: "no upstream + modified",
    label: "unpushed",
    stdout:
      "# branch.oid 4c5173bb9f894988dc317093eea21134f0f8a680\n# branch.head newbranch\n1 .M N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 f\n",
  },
  {
    name: "upstream gone",
    label: "clean",
    stdout:
      "# branch.oid 4c5173bb9f894988dc317093eea21134f0f8a680\n# branch.head newbranch\n# branch.upstream origin/newbranch\n",
  },
  {
    name: "detached",
    label: "clean",
    stdout:
      "# branch.oid 4c5173bb9f894988dc317093eea21134f0f8a680\n# branch.head (detached)\n",
  },
  {
    name: "detached + modified",
    label: "uncommitted",
    stdout:
      "# branch.oid 4c5173bb9f894988dc317093eea21134f0f8a680\n# branch.head (detached)\n1 .M N... 100644 100644 100644 78981922613b2afb6025042ff6bd878ac1994e85 78981922613b2afb6025042ff6bd878ac1994e85 f\n",
  },
  {
    name: "not a repository",
    label: "no-git",
    stdout: "",
    exitCode: 128,
  },
] as const;

const ID_OF: Record<(typeof CASES)[number]["name"], string> = {
  unborn: "GIT-3",
  "unborn + untracked": "GIT-7",
  clean: "GIT-8",
  modified: "GIT-7",
  staged: "GIT-7",
  "staged + untracked": "GIT-7",
  renamed: "GIT-7",
  "ahead 1": "GIT-5",
  "ahead 1 + modified": "GIT-5",
  "behind 1": "GIT-6",
  "no upstream": "GIT-4",
  "no upstream + modified": "GIT-4",
  "upstream gone": "GIT-8",
  detached: "GIT-3",
  "detached + modified": "GIT-7",
  "not a repository": "GIT-2",
};

for (const { name, label, stdout, ...rest } of CASES) {
  const gitExitCode: number = "exitCode" in rest ? rest.exitCode : 0;
  const gitStatus: string = stdout;
  test(`${ID_OF[name]}: ${name} は ${label} と表示する`, async ($, on) => {
    await startLoadedSession($, on, { gitStatus, gitExitCode });
    const ui = await $.ui.mount(BAND);
    const shown = [];

    for (const one of ["unpushed", "uncommitted", "clean", "no-git"]) {
      if (await ui.find({ type: "Text", text: new RegExp(`^${one}$`) })) {
        shown.push(one);
      }
    }

    expect(shown).toEqual([label]);
  });
}

for (const [status, expected] of [
  ["unpushed", "red"],
  ["uncommitted", "red"],
  ["clean", "green"],
  ["no-git", "blue"],
] as const) {
  test(`GIT-1: ${status} の色は ${expected} にする`, () => {
    expect(gitStatusColor(status)).toBe(COLOR[expected]);
  });
}

test("GIT-9: git は --no-optional-locks と -C <cwd> を付けて実行する", async ($, on) => {
  const { calls } = await startLoadedSession($, on);

  expect(calls.gitStatus[0]).toEqual([
    "git",
    "--no-optional-locks",
    "-C",
    "/home/x/proj",
    "status",
    "--porcelain=v2",
    "--branch",
  ]);
});

for (const [name, stdout, gitExitCode, branch] of [
  ["通常", GIT_CLEAN, 0, "main"],
  [
    "最初のコミット前",
    "# branch.oid (initial)\n# branch.head main\n",
    0,
    "main",
  ],
  [
    "スラッシュを含む",
    "# branch.oid x\n# branch.head feature/x\n",
    0,
    "feature/x",
  ],
  ["detached HEAD", "# branch.oid x\n# branch.head (detached)\n", 0, ""],
  ["gitでない", "", 128, ""],
] as const) {
  test(`BRANCH-1: ${name} は、ブランチ名を「${branch}」にする`, async ($, on) => {
    await startLoadedSession($, on, { gitStatus: stdout, gitExitCode });
    const ui = await $.ui.mount(BAND);

    expect(await isShown(ui, /^(main|feature\/x|\(detached\))$/)).toBe(
      branch !== "",
    );
    if (branch !== "") {
      expect(await isShown(ui, branch)).toBe(true);
    }
  });
}
