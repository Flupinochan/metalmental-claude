import type { Register } from "claude-code";

import {
  copyText,
  getCopyButtonStyle,
  padLabelToWidth,
  readCopyResults,
} from "./copyButton";
import { splitCopyTargetsFromAssistantMessage } from "./splitCopyTargetsFromAssistantMessage";
import {
  endTurn,
  isInfoNoticeShown,
  isToolGroupShown,
  isToolShown,
  readTurnState,
  recordToolCall,
  startTurn,
} from "./turnVisibility";

/**
 * ui-plus の描画を登録する
 * @param on フックを登録する関数
 */
export const register: Register = (on) => {
  on("ui.render", { component: "AssistantMessage" }, async ($, event, next) => {
    if (event.props.isSummary === true) {
      return next(event);
    }

    const messageParts = splitCopyTargetsFromAssistantMessage(event.props.text);

    if (!messageParts.some((part) => part.kind !== "plain")) {
      return next(event);
    }

    const { Box, Button, Markdown, Text } = $.ui.resolve(event);
    const results = await readCopyResults($);

    return (
      <Box flexDirection="row">
        <Text>{event.props.isFirstOfReply ? "● " : "  "}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {messageParts.map((part, index) => {
            if (part.kind === "plain") {
              return <Markdown key={`text-${index}`} text={part.plainText} />;
            }

            const id = `${event.requestId}:${index}`;
            const { label, color, hoverColor } = getCopyButtonStyle(
              part.kind,
              results[id],
            );
            const hover = { scope: `copy-${part.kind}:${id}` };
            const textToCopy =
              part.kind === "table" ? part.tableText : part.codeText;
            const displayedText =
              part.kind === "table" ? part.tableText : part.codeBlockText;

            return (
              <Box key={`${part.kind}-${index}`} flexDirection="column">
                <Box
                  borderStyle="round"
                  borderColor={color}
                  hover={{ ...hover, borderColor: hoverColor }}
                >
                  <Button
                    key={`copy-${part.kind}-${index}`}
                    plain
                    onPress={(press) =>
                      void copyText($, id, textToCopy, press.surface)
                    }
                  >
                    <Text color={color} hover={{ ...hover, color: hoverColor }}>
                      {padLabelToWidth(label, event.viewport?.columns)}
                    </Text>
                  </Button>
                </Box>
                {part.kind === "code" ? (
                  <Box
                    key={`code-frame-${index}`}
                    borderStyle="round"
                    borderColor={color}
                  >
                    <Markdown key={`code-text-${index}`} text={displayedText} />
                  </Box>
                ) : (
                  <Markdown key={`table-text-${index}`} text={displayedText} />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  });

  on("turn.start", async ($, event, next) => {
    if (event.agentId === undefined) {
      await startTurn($);
    }

    return next(event);
  });

  on("turn.complete", async ($, event, next) => {
    if (event.agentId === undefined) {
      await endTurn($);
    }

    return next(event);
  });

  on("tool.call", async ($, event, next) => {
    await recordToolCall($, event.tool_use_id);

    return next(event);
  });

  on("ui.render", { component: "ToolUse" }, async ($, event, next) => {
    const turn = await readTurnState($);

    if (
      event.props.isExpanded === true ||
      isToolShown(turn, event.props.tool_use_id)
    ) {
      return next(event);
    }

    const { Box } = $.ui.resolve(event);

    return <Box />;
  });

  on("ui.render", { component: "ToolResult" }, async ($, event, next) => {
    const turn = await readTurnState($);

    if (
      event.props.isExpanded === true ||
      isToolShown(turn, event.props.tool_use_id)
    ) {
      return next(event);
    }

    const { Box } = $.ui.resolve(event);

    return <Box />;
  });

  on("ui.render", { component: "ToolGroup" }, async ($, event, next) => {
    const turn = await readTurnState($);

    if (event.props.isExpanded || isToolGroupShown(turn, event.props.calls)) {
      return next(event);
    }

    const { Box } = $.ui.resolve(event);

    return <Box />;
  });

  on("ui.render", { component: "ToolProgress" }, async ($, event, next) => {
    const turn = await readTurnState($);

    if (isToolShown(turn, event.props.tool_use_id)) {
      return next(event);
    }

    const { Box } = $.ui.resolve(event);

    return <Box />;
  });

  on("ui.render", { component: "TurnDuration" }, ($, event, next) => {
    if (event.props.isExpanded === true) {
      return next(event);
    }

    const { Box } = $.ui.resolve(event);

    return <Box />;
  });

  on("ui.render", { component: "InfoNotice" }, async ($, event, next) => {
    const turn = await readTurnState($);

    if (isInfoNoticeShown(turn)) {
      return next(event);
    }

    const { Box } = $.ui.resolve(event);

    return <Box />;
  });
};
