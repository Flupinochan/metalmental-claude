import type { Register } from "claude-code";

import {
  copyText,
  getCopyButtonStyle,
  padLabelToWidth,
  readCopyResults,
} from "./copyButton";
import { COLOR } from "./colors";
import {
  headingOf,
  isFirstBlock,
  isGroupFoldable,
  isOpen,
  noteAnswerBlock,
  noteQuestionSeen,
  startAnswerTurn,
  toggleOpen,
} from "./foldState";
import { firstLineOf, isMultiline } from "./foldText";
import {
  ANSWER_TOGGLE_RESERVED,
  QUESTION_TOGGLE_RESERVED,
  padLabelToRight,
} from "./labelWidth";
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

    const group = noteAnswerBlock($, event.requestId, event.props.text);

    const { Box, Button, Markdown, Text } = $.ui.resolve(event);
    const bullet = event.props.isFirstOfReply ? "● " : "  ";

    if (!isGroupFoldable(group)) {
      const plainText = event.props.text.trim();

      if (plainText === "") {
        return next(event);
      }

      return (
        <Box flexDirection="row">
          <Text>{bullet}</Text>
          <Box flexGrow={1}>
            <Text color={COLOR.green}>{plainText}</Text>
          </Box>
        </Box>
      );
    }

    const open = await isOpen($, group.key);
    const isFirst = isFirstBlock(group, event.requestId);

    if (!open) {
      if (!isFirst) {
        return <Box />;
      }

      return (
        <Box flexDirection="row">
          <Text>{bullet}</Text>
          <Button
            key="toggle"
            plain
            onPress={() => void toggleOpen($, group.key, open)}
          >
            <Text color={COLOR.green}>
              {padLabelToRight(
                `▶ ${headingOf(group)}`,
                event.viewport?.columns,
                ANSWER_TOGGLE_RESERVED,
              )}
            </Text>
          </Button>
        </Box>
      );
    }

    const messageParts = splitCopyTargetsFromAssistantMessage(event.props.text);
    const results = await readCopyResults($);
    const body = (
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
    );

    if (!isFirst) {
      return (
        <Box flexDirection="row">
          <Text>{bullet}</Text>
          {body}
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text>{bullet}</Text>
          <Button
            key="toggle"
            plain
            onPress={() => void toggleOpen($, group.key, open)}
          >
            <Text color={COLOR.orange}>
              {padLabelToRight(
                "▼ 閉じる",
                event.viewport?.columns,
                ANSWER_TOGGLE_RESERVED,
              )}
            </Text>
          </Button>
        </Box>
        <Box flexDirection="row">
          <Text>{"  "}</Text>
          {body}
        </Box>
      </Box>
    );
  });

  on("ui.render", { component: "UserMessage" }, async ($, event, next) => {
    if (event.props.origin.kind !== "composer" || event.props.isExpanded) {
      return next(event);
    }

    const { Box, Button, Text } = $.ui.resolve(event);

    if (!isMultiline(event.props.text)) {
      return <Text color={COLOR.blue}>{event.props.text}</Text>;
    }

    noteQuestionSeen($, event.requestId);
    const open = await isOpen($, event.requestId);

    if (open) {
      const standard = await next(event);

      return (
        <Box flexDirection="column">
          <Button
            key="toggle"
            plain
            onPress={() => void toggleOpen($, event.requestId, open)}
          >
            <Text color={COLOR.orange}>
              {padLabelToRight(
                "▼ 閉じる",
                event.viewport?.columns,
                QUESTION_TOGGLE_RESERVED,
              )}
            </Text>
          </Button>
          {standard}
        </Box>
      );
    }

    return (
      <Button
        key="toggle"
        plain
        onPress={() => void toggleOpen($, event.requestId, open)}
      >
        <Text color={COLOR.blue}>
          {padLabelToRight(
            `▶ ${firstLineOf(event.props.text)}`,
            event.viewport?.columns,
            QUESTION_TOGGLE_RESERVED,
          )}
        </Text>
      </Button>
    );
  });

  on("turn.start", async ($, event, next) => {
    if (event.agentId === undefined) {
      startAnswerTurn($, event.turnId);
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
