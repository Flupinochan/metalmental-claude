---
name: commit
description: Use when the user wants to commit changes without review.
compatibility: Requires git
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git add *) Bash(git commit *)
---

# Simple Commit Workflow

## Step 1: Detect Source

See [get-target-files.md](../../skills/get-target-files.md) to obtain the target files and detect the source (`staged` or `workspace`), then proceed to Step 2.

## Step 2: Group Changes

If `Source: workspace`, split workspace changes into logical groups if needed (e.g., feature, fix, docs).

Present the proposed groupings to the user via `AskUserQuestion` tool:

> "Split into N commits with these groups?"
> Group 1: `<files>`
> Group 2: `<files>`
> ...

Options:

- **Approve:** Use the proposed groupings.
- **Single commit:** Treat all files as one group.
- **Specify manually:** Ask the user for groupings.

If `Source: staged`, skip this step.

## Step 3: Generate Commit Message

Generate a commit message following these rules:

**Format:** `<type>: <description>`

**Type prefixes:**

| Type       | When to use                                            |
| ---------- | ------------------------------------------------------ |
| `feat`     | New feature                                            |
| `fix`      | Bug fix                                                |
| `docs`     | Documentation changes only                             |
| `style`    | Formatting changes that do not affect behavior         |
| `refactor` | Code restructuring without bug fix or feature addition |
| `test`     | Adding or modifying tests                              |
| `chore`    | Build, dependencies, or tooling changes                |
| `ci`       | CI/CD configuration changes                            |
| `perf`     | Performance improvements                               |

Present the generated message to the user via `AskUserQuestion` tool:

> "Use this commit message?"
> `<generated message>`

Options:

- **Approve:** Use the generated message as-is.
- **Specify manually:** Ask the user for a message.

## Step 4: Commit

Always prefix `git commit` with `CLAUDE_COMMIT_ALLOWED=1`.

- If `Source: staged`:
  ```bash
  CLAUDE_COMMIT_ALLOWED=1 git commit -m "<approved message>"
  ```
- If `Source: workspace`:
  ```bash
  git add <files for this group>
  CLAUDE_COMMIT_ALLOWED=1 git commit -m "<approved message>"
  ```

Repeat Steps 3–4 for each remaining group.
