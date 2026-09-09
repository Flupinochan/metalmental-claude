# sandbox-enforce

## Overview

A skill plugin for Claude Code

- Scans every `.claude/settings.json` / `.claude/settings.local.json` under `$HOME`
  (and, on WSL2, every Windows-side `/mnt/c/Users/<user>/.claude`) for `sandbox.enabled`
- Consolidates sandboxing to each installation's own user settings
  (`~/.claude/settings.json` on the WSL/Linux/macOS side, `<user>/.claude/settings.json`
  on the Windows side) after explicit confirmation, removing the `sandbox.enabled` key
  from other project-level files so they inherit the user setting instead
- Never edits any file directly from the conversation: all writes go through
  `scripts/scan_sandbox.py --fix`, which touches only the `sandbox.enabled` boolean and
  never surfaces the rest of the file's contents (settings files can carry API tokens
  in `env`)
- Reports (without modifying) organization `managed-settings.json` policy and missing
  sandbox dependencies (`bubblewrap`, `socat` on Linux/WSL)

## Available Skills

| Skill | Description | Auto-invocation |
| --- | --- | --- |
| `/enable-sandbox-everywhere` | Scans the whole machine for `sandbox.enabled` and enables it after confirmation | Enabled |

## File Structure

| File | Role |
| --- | --- |
| `skills/enable-sandbox-everywhere/SKILL.md` | Scan -> confirm -> fix workflow |
| `skills/enable-sandbox-everywhere/scripts/scan_sandbox.py` | Read-only scan (default), `--current`, `--deps`, and the only entry point for writes (`--fix`) |

## Notes

- Designed for WSL2 in addition to native Linux and macOS: it walks both the WSL-side
  `$HOME` and, when running under WSL2, the Windows-side `/mnt/c/Users/*/.claude`
- `managed-settings.json` (organization policy) is reported but never modified; user
  settings cannot override it
- The current session's own project settings are intentionally excluded from automatic
  fixes, since a user may have disabled sandboxing there on purpose to run the full scan
