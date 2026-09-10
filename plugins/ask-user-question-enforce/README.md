# ask-user-question-enforce

## Overview

A skill plugin for Claude Code

- Standardizes how a skill's SKILL.md expresses a confirmation to the user: always name the `AskUserQuestion` tool explicitly instead of vague prose like "confirm with the user"
- `AskUserQuestion` plays a notification sound while waiting for an answer, so an explicit reference keeps that signal from being silently dropped
- Defines a single canonical argument structure (`questions` / `header` / `options` / `multiSelect`) so every skill in this repository asks questions the same way
- Scoped to the `AskUserQuestion` notation only; overall SKILL.md structure and frontmatter conventions are out of scope

## Available Skills

| Skill | Description | Auto-invocation |
| --- | --- | --- |
| `/ask-user-question-enforce` | Applies the AskUserQuestion notation when creating or editing a skill | Enabled |

## File Structure

| File | Role |
| --- | --- |
| `skills/ask-user-question-enforce/SKILL.md` | AskUserQuestion argument template, constraints, and examples |

## Notes

- Applies repository-wide to every plugin's skills, not just a specific plugin
- Does not modify existing skills on its own; it is applied the next time a skill is created or edited
