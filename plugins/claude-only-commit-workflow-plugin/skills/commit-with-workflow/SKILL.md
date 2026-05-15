---
name: commit-with-workflow
description: Use when the user wants to commit changes.
compatibility: Requires git
license: MIT
metadata:
  author: MetalMental
  version: "1.0"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git add *) Bash(git commit *) Agent Skill
---

# Commit Workflow

## Step 1: Review

Spawn the following **5 subagents in parallel**:

| Agent name               | Perspective     |
| ------------------------ | --------------- |
| `review-security`        | Security        |
| `review-performance`     | Performance     |
| `review-readability`     | Readability     |
| `review-maintainability` | Maintainability |
| `review-testing`         | Testing         |

**If any agent reports issues:** Report all issues to the user and stop.

**If all agents respond `LGTM`:** Invoke the `/commit` skill to proceed with grouping, message generation, and committing.
