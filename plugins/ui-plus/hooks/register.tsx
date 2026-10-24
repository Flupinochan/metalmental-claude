import type { Register } from "claude-code";

import { splitTablesFromAssistantMessage } from "./splitTablesFromAssistantMessage";
import {
  copyTable,
  padLabelToWidth,
  readCopyResults,
  getCopyButtonStyle,
} from "./tableCopy";

/**
 * ui-plus の描画を登録する
 * @param on フックを登録する関数
 */
export const register: Register = (on) => {
  on("ui.render", { component: "AssistantMessage" }, async ($, event, next) => {
    if (event.props.isSummary === true) {
      return next(event);
    }

    const messageParts = splitTablesFromAssistantMessage(event.props.text);

    if (!messageParts.some((part) => part.kind === "table")) {
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
              results[id],
            );
            const hover = { scope: `copy-table:${id}` };

            return (
              <Box key={`table-${index}`} flexDirection="column">
                <Box
                  borderStyle="round"
                  borderColor={color}
                  hover={{ ...hover, borderColor: hoverColor }}
                >
                  <Button
                    key={`copy-table-${index}`}
                    plain
                    onPress={(press) =>
                      void copyTable($, id, part.tableText, press.surface)
                    }
                  >
                    <Text color={color} hover={{ ...hover, color: hoverColor }}>
                      {padLabelToWidth(label, event.viewport?.columns)}
                    </Text>
                  </Button>
                </Box>
                <Markdown key={`table-text-${index}`} text={part.tableText} />
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  });
};
