// returnの戻り型
//   失敗時: { error: string }
//   成功時: {
//     mode: string,
//     target?: string,
//     summary: string,
//     findings: Array<{ file: string, line?: number, items: Array<{ source: string, viewpointHeading: string, reason: string }> }>,
//     failedReviewers: string[],
//     stats: { reviewers: number },
//   }

// modelはargs経由で動的に受け取るため、後でagent呼び出し時に指定
// whenToUseは定義しない。SKILL経由でargs指定で呼び出す必要があるため
export const meta = {
  name: "code-review-by-book-workflow",
  description: "技術書ベースのコードレビューworkflowを実行",
  phases: [
    {
      title: "Scope",
      detail:
        "local/pr/freeいずれかのmodeをもとに、scope-collector subagentを起動し、レビュー対象を出力するコマンドを取得",
    },
    {
      title: "Review",
      detail:
        "レビュー観点ファイルごとにreviewer subagentを起動し、並行してレビューを実施",
    },
  ],
};

// workflow呼び出し時のargsバリデーション処理
const { mode, target, reviewViewpointFiles, model } = args ?? {};

const VALID_MODES = ["local", "pr", "free"];
if (!VALID_MODES.includes(mode)) {
  return {
    error: `mode に無効な値 "${mode}" が渡されました。local, pr, free のいずれかを指定する必要があります`,
  };
}

if (!Array.isArray(reviewViewpointFiles) || reviewViewpointFiles.length === 0) {
  return {
    error:
      "reviewViewpointFiles が指定されていません。レビュー観点ファイルを1つ以上指定する必要があります",
  };
}

const VALID_MODELS = ["haiku", "sonnet", "opus"];
if (!VALID_MODELS.includes(model)) {
  return {
    error: `model に無効な値 "${model}" が渡されました。haiku, sonnet, opus のいずれかを指定する必要があります`,
  };
}

const trimmedTarget = typeof target === "string" ? target.trim() : "";
if ((mode === "pr" || mode === "free") && !trimmedTarget) {
  return {
    error: `mode=${mode} を指定する場合は target も指定する必要があります`,
  };
}

// フェーズ1: レビュー対象のコードを取得
const scopePrompt = `mode: ${mode}${trimmedTarget ? `\ntarget: ${trimmedTarget}` : ""}`;

phase("Scope");
const scopeResponse = await agent(scopePrompt, {
  agentType: "code-review-by-book:scope-collector",
  label: "scope",
  schema: {
    type: "object",
    properties: {
      error: {
        type: "string",
        description:
          "コマンドがエラーになった場合にそのコマンドとエラー出力。設定する場合、他のフィールドは設定不要。",
      },
      reviewTargetCommand: {
        type: "string",
        description:
          "レビュー対象を出力するコマンド。例: git diff --cached、grep -n -I '' src/main.ts",
      },
    },
  },
});
if (!scopeResponse) {
  return {
    error:
      "scope-collector agentから結果を取得できませんでした。agentにおけるコマンドの実行エラー、またはagentの不具合の可能性があります",
  };
}
if (scopeResponse.error) {
  return {
    error: `scope-collector agentにおいてコマンドでエラーが発生しました: ${scopeResponse.error}`,
  };
}
if (!scopeResponse.reviewTargetCommand) {
  return {
    error: "scope-collector agentのresponse fieldが不足しています",
  };
}
log(
  `mode: ${mode}
レビュー観点ファイル数: ${reviewViewpointFiles.length}件`,
);

const viewpointFiles = reviewViewpointFiles.map((viewpointFilePath) => ({
  viewpointFileName: (
    viewpointFilePath.split(/[\\/]/).pop() || viewpointFilePath
  ).replace(/\.md$/, ""),
  viewpointFilePath,
}));

// フェーズ2: レビューを実施
const buildReviewPrompt = (viewpointFilePath) => `## レビュー観点

レビュー観点が記載されたファイルの絶対パス: ${viewpointFilePath}

## レビュー対象

レビュー対象を出力するコマンド: ${scopeResponse.reviewTargetCommand}

${mode === "free" ? `その他 (任意): ${trimmedTarget}\n` : ""}`;

phase("Review");
const candidatesByReviewer = await parallel(
  viewpointFiles.map(
    (viewpointFile) => async () => {
      const reviewerResult = await agent(
        buildReviewPrompt(viewpointFile.viewpointFilePath),
        {
          agentType: "code-review-by-book:reviewer",
          label: viewpointFile.viewpointFileName,
          phase: "Review",
          schema: {
            type: "object",
            required: ["candidates"],
            properties: {
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  required: ["file", "reason", "viewpointHeading"],
                  properties: {
                    file: {
                      type: "string",
                      description:
                        "実行ディレクトリを起点とした該当ファイルの相対パス。例: src/main.ts",
                    },
                    line: { type: "number", description: "該当行番号" },
                    reason: {
                      type: "string",
                      description: "指摘理由を1,2行で要約",
                    },
                    viewpointHeading: {
                      type: "string",
                      description:
                        "レビュー観点ファイル内における指摘に利用した見出し名",
                    },
                  },
                },
              },
            },
          },
          model,
        },
      );
      if (!reviewerResult) return null;
      log(
        `${viewpointFile.viewpointFileName}: 候補${reviewerResult.candidates.length}件`,
      );
      return reviewerResult.candidates.map((candidate) => ({
        ...candidate,
        source: viewpointFile.viewpointFileName,
      }));
    },
  ),
);
const failedReviewers = viewpointFiles
  .filter((_, i) => !candidatesByReviewer[i])
  .map((viewpointFile) => viewpointFile.viewpointFileName);
if (failedReviewers.length > 0) {
  log(`失敗したreviewer: ${failedReviewers.join(", ")}`);
}
const candidates = candidatesByReviewer.filter(Boolean).flat();

const groupsByLocation = new Map();
for (const { file, line, source, viewpointHeading, reason } of candidates) {
  const key = `${file}:${line ?? ""}`;
  if (!groupsByLocation.has(key)) {
    groupsByLocation.set(key, { file, line, items: [] });
  }
  groupsByLocation.get(key).items.push({ source, viewpointHeading, reason });
}
const findings = [...groupsByLocation.values()].sort(
  (a, b) =>
    a.file.localeCompare(b.file) ||
    (a.line ?? Infinity) - (b.line ?? Infinity),
);

return {
  mode,
  target: trimmedTarget || undefined,
  summary:
    findings.length > 0
      ? `${reviewViewpointFiles.length}件のレビュー観点ファイルから${candidates.length}件の指摘が見つかり、${findings.length}箇所に集約しました`
      : failedReviewers.length > 0
        ? "指摘は見つかりませんでしたが、一部のreviewerが失敗しました"
        : "レビュー指摘はありませんでした",
  findings,
  failedReviewers,
  stats: {
    reviewers: viewpointFiles.length - failedReviewers.length,
  },
};
