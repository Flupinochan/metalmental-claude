---
allowed-tools: Bash(git:*), Bash(touch:*), Bash(rm:*), AskUserQuestion
description: Commit changes via Claude with staging assistance, review, and message approval
---

Use the `commit-workflow` skill from the `claude-only-commit-workflow` plugin to handle this commit.

The skill manages the guard file lifecycle, staging, review, commit message generation, and user approval.
