---
name: clear-tool-failure-logs
description: Use when the user explicitly asks to clear, delete, or clean up the PostToolUseFailure log files written by this plugin's hook. Destructive operation — never triggered automatically by Claude, only on explicit user invocation.
disable-model-invocation: true
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: AskUserQuestion Bash(ls "${CLAUDE_PLUGIN_DATA}"/logs/*.log) Bash(wc -l "${CLAUDE_PLUGIN_DATA}"/logs/*.log) Bash(rm "${CLAUDE_PLUGIN_DATA}"/logs/*.log)
---

# Clear Tool Failure Logs

Delete `PostToolUseFailure` log files (`${CLAUDE_PLUGIN_DATA}/logs/YYYYMMDD.log`) written by
this plugin's hook.

## Step 1: Inventory

Run `ls -la "${CLAUDE_PLUGIN_DATA}"/logs/*.log 2>/dev/null` (and optionally `wc -l` per file)
to list existing log files with size/line counts. If none exist, report that and stop.

## Step 2: Confirm scope

Call the `AskUserQuestion` tool based on the following:

```
questions:
  - question: Which log files should be deleted?
    header: Delete scope
    multiSelect: false
    options:
      - label: Delete all
        description: Remove every listed log file
      - label: Delete a specific date
        description: Prompt for an 8-digit date (YYYYMMDD) and delete only that date's log file
      - label: Cancel
        description: Do not delete anything
```

If "Delete a specific date" is selected, prompt for an 8-digit date (`YYYYMMDD`) and delete only
`${CLAUDE_PLUGIN_DATA}/logs/<date>.log`

## Step 3: Execute

- All: `rm "${CLAUDE_PLUGIN_DATA}"/logs/*.log`
- Specific date: validate the input strictly matches `^[0-9]{8}$` before running
  `rm "${CLAUDE_PLUGIN_DATA}"/logs/<date>.log`. Refuse and report an error if the input does
  not match this pattern (do not attempt to interpret partial dates, ranges, or relative
  expressions such as "yesterday" or "last week").

## Step 4: Report

State exactly which file(s) were deleted, or that nothing matched.
