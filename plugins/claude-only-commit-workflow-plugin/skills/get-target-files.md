# Get Target Files

Follow these steps to obtain the diff to review.

## Step 1: Check staged files

Run:

```bash
git diff --cached --name-only
```

**If files exist:** Record source as **staged**. Skip Step 2 and proceed to Step 3.

**If no files:** Proceed to Step 2.

## Step 2: Check unstaged files

Run:

```bash
git diff --name-only
git ls-files --others --exclude-standard
```

Combine results as the target file list. Record source as **workspace**. Proceed to Step 3.

## Step 3: Get diff

- **If source was staged:** Run `git diff --cached` to get the full diff.
- **If source was workspace:** Run `git diff` for modified tracked files. For each untracked new file, run `git diff --no-index /dev/null <file>` to get its content.

Use the detected **source** (`staged` or `workspace`) and the full **diff** in your review output.
