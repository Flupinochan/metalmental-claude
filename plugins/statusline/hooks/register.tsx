import type { Register } from "claude-code";

import { formatBunVersion, readBunVersion } from "./bun";
import { COLOR } from "./colors";
import { ctxColor, formatCtx, readCtx, syncCtx } from "./ctx";
import { gitStatusColor, readBranchName, readGitStatus } from "./gitStatus";
import { formatGoVersion, readGoVersion } from "./go";
import { formatModel, modelColor, readModelId, syncModelId } from "./model";
import { formatNodeVersion, readNodeVersion } from "./nodejs";
import { formatPythonVersion, readPythonVersion } from "./python";
import { formatRustVersion, readRustVersion } from "./rust";
import { formatTerraformVersion, readTerraformVersion } from "./terraform";
import { readOutputStyle, syncOutputStyle } from "./outputStyle";
import {
  openPullRequest,
  readPullRequests,
  summarizePullRequests,
} from "./pullRequest";
import {
  readRateLimits,
  summarizeRateLimits,
  syncRateLimits,
} from "./rateLimits";
import { readReloadStatus, reloadManually, summarizeReload } from "./reload";
import { pressReview, readReviewedCommands, summarizeReviews } from "./review";
import { syncStatusline } from "./syncStatusline";
import {
  copyWorkingDirectory,
  directoryName,
  readWorkingDirectory,
  workingDirectoryColor,
} from "./workingDirectory";

const COMMANDS_TO_RESYNC = [
  "cd",
  "clear",
  "resume",
  "branch",
  "rewind",
] as const;

/**
 * statusline の各イベントのフックと、入力欄の上の描画を登録する
 * @param on フックを登録する関数
 * @returns なし
 */
export const register: Register = (on) => {
  on("session.start", async ($, event, next) => {
    await syncStatusline($);

    return next(event);
  });

  on("turn.complete", async ($, event, next) => {
    if (event.agentId === undefined) {
      await syncStatusline($);
    }

    return next(event);
  });

  on("session.measure", async ($, event, next) => {
    if (event.changed.includes("context")) {
      await syncCtx($);
    }

    if (event.changed.includes("rateLimits")) {
      await syncRateLimits($);
    }

    return next(event);
  });

  on("classic.PostCompact", async ($, event, next) => {
    await syncCtx($);

    return next(event);
  });

  on("config.set", async ($, event, next) => {
    const result = await next(event);
    await syncOutputStyle($);

    return result;
  });

  on("command.run", { command: "model" }, async ($, event, next) => {
    const ran = await next(event);
    await syncModelId($);

    return ran;
  });

  on("command.run", { command: "output-style" }, async ($, event, next) => {
    const ran = await next(event);
    await syncOutputStyle($);

    return ran;
  });

  for (const command of COMMANDS_TO_RESYNC) {
    on("command.run", { command }, async ($, event, next) => {
      const ran = await next(event);
      $.clock.after(0, () => syncStatusline($));

      return ran;
    });
  }

  on("ui.render", { component: "AbovePrompt" }, async ($, event, next) => {
    const [
      reloadStatus,
      gitStatus,
      workingDirectory,
      branchName,
      nodeVersion,
      pythonVersion,
      rustVersion,
      goVersion,
      bunVersion,
      terraformVersion,
      pullRequests,
      modelId,
      outputStyle,
      ctxPercent,
      rateLimits,
      reviewedCommands,
    ] = await Promise.all([
      readReloadStatus($),
      readGitStatus($),
      readWorkingDirectory($),
      readBranchName($),
      readNodeVersion($),
      readPythonVersion($),
      readRustVersion($),
      readGoVersion($),
      readBunVersion($),
      readTerraformVersion($),
      readPullRequests($),
      readModelId($),
      readOutputStyle($),
      readCtx($),
      readRateLimits($),
      readReviewedCommands($),
    ]);

    if (event.props.hasSurvey || event.surface === "mobile") {
      return next(event);
    }

    const { Box, Button, Text } = $.ui.resolve(event);
    const { icon: reloadIcon, color: reloadColor } =
      summarizeReload(reloadStatus);

    return (
      <Box
        flexDirection="row"
        flexWrap="wrap"
        columnGap={1}
        position="relative"
      >
        <Button key="reload" plain onPress={() => void reloadManually($)}>
          <Text color={reloadColor}>{reloadIcon}</Text>
        </Button>
        {gitStatus !== undefined && (
          <Text color={gitStatusColor(gitStatus)}>{gitStatus}</Text>
        )}
        {workingDirectory !== "" && (
          <Button
            key="working-directory"
            plain
            hover={{ scope: "working-directory" }}
            onPress={(press) =>
              void copyWorkingDirectory($, workingDirectory, press.surface)
            }
          >
            <Text color={workingDirectoryColor(workingDirectory)}>
              {directoryName(workingDirectory)}
            </Text>
          </Button>
        )}
        {branchName !== "" && <Text color={COLOR.indigo}>{branchName}</Text>}
        {summarizePullRequests(pullRequests).map(
          ({ number, url, text, color }) => (
            <Button
              key={`pull-request-${number}`}
              plain
              onPress={() => void openPullRequest($, url)}
            >
              <Text color={color}>{text}</Text>
            </Button>
          ),
        )}
        {modelId !== "" && (
          <Text color={modelColor(modelId)}>{formatModel(modelId)}</Text>
        )}
        {outputStyle !== undefined && (
          <Text color={COLOR.orange}>{outputStyle}</Text>
        )}
        <Text color={ctxColor(ctxPercent)}>{formatCtx(ctxPercent)}</Text>
        {summarizeRateLimits(rateLimits).map(({ kind, text, color }) => (
          <Text key={kind} color={color}>
            {text}
          </Text>
        ))}
        {summarizeReviews(reviewedCommands).map(({ command, label, color }) => (
          <Button
            key={label}
            plain
            onPress={() => void pressReview($, command)}
          >
            <Text color={color}>{label}</Text>
          </Button>
        ))}
        {nodeVersion !== "" && (
          <Text color={COLOR.green}>{formatNodeVersion(nodeVersion)}</Text>
        )}
        {pythonVersion !== "" && (
          <Text color={COLOR.yellow}>{formatPythonVersion(pythonVersion)}</Text>
        )}
        {rustVersion !== "" && (
          <Text color={COLOR.orange}>{formatRustVersion(rustVersion)}</Text>
        )}
        {goVersion !== "" && (
          <Text color={COLOR.blue}>{formatGoVersion(goVersion)}</Text>
        )}
        {bunVersion !== "" && (
          <Text color={COLOR.purple}>{formatBunVersion(bunVersion)}</Text>
        )}
        {terraformVersion !== "" && (
          <Text color={COLOR.indigo}>
            {formatTerraformVersion(terraformVersion)}
          </Text>
        )}
        {workingDirectory !== "" && (
          <Box
            position="absolute"
            top={0}
            bottom={0}
            left={0}
            right={0}
            display="none"
            backgroundColor={COLOR.blue}
            hover={{ scope: "working-directory", display: "flex" }}
          >
            <Button
              key="working-directory-path"
              plain
              onPress={(press) =>
                void copyWorkingDirectory($, workingDirectory, press.surface)
              }
            >
              <Text color={workingDirectoryColor(workingDirectory)}>
                {workingDirectory}
              </Text>
            </Button>
          </Box>
        )}
      </Box>
    );
  });
};
