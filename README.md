# claude-only-commit-workflow

## Overview

A SKILL Plugin for Claude Code

- Prevents manual `git commit` and restricts commits to Claude only
- Automates code review and commit message generation

## Available Skills

| Skill                   | Description                                                                    | Review |
| ----------------------- | ------------------------------------------------------------------------------ | ------ |
| `/commit-with-workflow` | Runs code review with 5 sub-agents and commits only if all reviews pass (LGTM) | Yes    |
| `/commit`               | Commits immediately without review                                             | No     |

## Workflow

### `/commit-with-workflow`

```mermaid
flowchart TD
    A(["/commit-with-workflow"]) --> B["Get changed files"]
    B --> C{Parallel review by sub-agents}

    C --> R1["review-security"]
    C --> R2["review-performance"]
    C --> R3["review-readability"]
    C --> R4["review-maintainability"]
    C --> R5["review-testing"]

    R1 & R2 & R3 & R4 & R5 --> D{All LGTM?}

    D -- "Issues found" --> E([Report to user and exit. No commit.])
    D -- "All LGTM" --> F["/commit"]

    F --> G{staged/workspace?}
    G -- staged --> J
    G -- workspace --> H["Split changes into appropriate commit units"]
    H --> J["Generate commit message"]
    J --> K["Commit"]
    K --> L{Remaining files in workspace?}
    L -- Yes --> J
    L -- No --> M([Done])
```

## File Structure

| File                                   | Role                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `skills/commit-with-workflow/SKILL.md` | `/commit-with-workflow` main flow                     |
| `skills/commit/SKILL.md`               | `/commit` commit message generation and execution     |
| `skills/get-target-files.md`           | Retrieves changed files (staged or workspace)         |
| `agents/review-*.md`                   | Individual sub-agents for each review category        |
| `skills/review-output-format.md`       | Output format specification for each sub-agent        |
| `hooks/hooks.json`                     | Hook that blocks `git commit` from outside of Claude  |
