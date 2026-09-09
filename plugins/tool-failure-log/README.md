# tool-failure-log

## Overview

A hooks + skills plugin for Claude Code

- Automatically logs every `PostToolUseFailure` event to this plugin's persistent data
  directory (`${CLAUDE_PLUGIN_DATA}/logs/YYYYMMDD.log`, one JSON object per line)
- Provides a skill to clear the accumulated log files
- Provides a skill that forks a read-only sub-agent to investigate recurring failures and
  propose settings.json remediation ideas

## Available Skills

| Skill                       | Description                                                                    | Auto-invocation |
| ---------------------------- | -------------------------------------------------------------------------------| ---------------- |
| `/clear-tool-failure-logs`   | Deletes all log files, or a specific `YYYYMMDD` log file, after confirmation   | Disabled         |
| `/analyze-tool-failures`     | Forks `settings-fix-advisor` to analyze logs and propose settings.json changes | Disabled         |

Both skills are `disable-model-invocation: true` and only run when explicitly invoked by the
user.

## File Structure

| File                                        | Role                                                              |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `hooks/hooks.json`                           | Registers the `PostToolUseFailure` hook                           |
| `scripts/log-tool-failure.sh`                | Appends the failure event JSON to `${CLAUDE_PLUGIN_DATA}/logs/`   |
| `skills/clear-tool-failure-logs/SKILL.md`    | Deletes log files (all or a specific date)                        |
| `skills/analyze-tool-failures/SKILL.md`      | Forks `settings-fix-advisor` for a read-only investigation        |
| `agents/settings-fix-advisor.md`             | Read-only agent that proposes settings.json changes                |

## Notes

- Logs are stored under `${CLAUDE_PLUGIN_DATA}` (resolves to
  `~/.claude/plugins/data/<plugin-name>-<marketplace-name>/`, e.g.
  `~/.claude/plugins/data/tool-failure-log-metalmental-plugins-official/` when
  installed from this marketplace), which is namespaced per plugin, persists across plugin
  updates, and is removed automatically on uninstall.
- If you already have a personal `PostToolUseFailure` hook configured in your own
  `~/.claude/settings.json`, consider disabling it after installing this plugin — otherwise
  both mechanisms will log the same events independently (to different files, since this
  plugin does not write to your personal log directory).
- `settings-fix-advisor` only has `Read`, `Grep`, and `Glob` tools. It cannot execute
  commands or edit files, so it can only propose changes — applying them is a separate,
  explicit step you take yourself.
