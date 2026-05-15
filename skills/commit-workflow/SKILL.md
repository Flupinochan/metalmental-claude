---
name: commit-workflow
description: Full commit workflow for claude-only-commit-workflow plugin. Manages guard file, staging, review, message generation, and user approval.
version: 1.0.0
---

# Commit Workflow

## Commit Command Format

ALWAYS use this exact format when committing. Never run `git commit` without the prefix.

```bash
CLAUDE_COMMIT_ALLOWED=1 git commit -m "<message>"
```

## Workflow Steps

### Step 1: Check staged changes

Run `git status --short` and `git diff --cached --stat`.

**If staged changes exist:** Proceed to Step 2.

**If no staged changes:** Run `git diff --stat` to show workspace changes. Use `AskUserQuestion` to ask which files to stage:

- Show the list of changed files as options
- Stage selected files with `git add <files>`
- If user selects none or cancels: abort (do NOT create guard file)

### Step 2: Review staged diff

Run `git diff --cached` to get the full diff.

Review for:

- Code quality issues (obvious bugs, unhandled errors)
- Security issues (hardcoded secrets, unsafe inputs)
- Unintended changes (debug code, commented-out blocks, wrong files)

**If issues found:** Report findings clearly. Abort without committing. Do NOT create the guard file.

**If clean:** Proceed to Step 3.

### Step 3: Generate commit message

Analyze `git diff --cached` to generate a concise commit message:

- Use imperative mood ("Add", "Fix", "Update", not "Added")
- First line: 50 chars or fewer, no trailing period
- If body needed: blank line, then wrapped at 72 chars

### Step 4: User approval via AskUserQuestion

Ask:

> "Commit with this message?"
> `<generated message>`

Options: Approve / Edit / Cancel

- **Approve:** Proceed to Step 5.
- **Edit:** Ask user to provide the message, then proceed to Step 5.
- **Cancel:** Abort. Do NOT create the guard file.

### Step 5: Commit

```bash
CLAUDE_COMMIT_ALLOWED=1 git commit -m "<approved message>"
```

Report the commit hash and summary to the user.
