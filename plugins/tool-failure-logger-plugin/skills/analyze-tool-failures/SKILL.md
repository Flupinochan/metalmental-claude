---
name: analyze-tool-failures
description: Use when the user explicitly asks to analyze tool failures, investigate why tools keep failing, or wants a settings.json remediation proposal based on recorded PostToolUseFailure log entries. Read-only investigation — never modifies any file. Only triggered on explicit user invocation.
disable-model-invocation: true
context: fork
agent: settings-fix-advisor
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
---

# Analyze Tool Failures

Investigate recent `PostToolUseFailure` log entries under `${CLAUDE_PLUGIN_DATA}/logs/*.log`
(written by this plugin's hook) and correlate them with the current Claude Code settings.json
configuration (global `~/.claude/settings.json`, and project-level `.claude/settings.json` /
`.claude/settings.local.json` when present).

`$ARGUMENTS` may specify a lookback window: a number of days (e.g. `7`) or a specific
`YYYYMMDD` date. Default to the last 7 days of logs when no argument is given.

Produce a prioritized, human-readable report of likely configuration-related root causes and
concrete proposed settings.json changes. Do not edit any file — this skill only reports
proposals for the user to review and apply manually.
