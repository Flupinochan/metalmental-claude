#!/usr/bin/env bash

input=$(cat)

if grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' <<<"$input"; then
  exit 0
fi

# CLAUDE_PROJECT_DIR は worktree に入っても変わらないため、入力の cwd を使う
cwd=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).cwd ?? "")' <<<"$input" 2>/dev/null)
cd "${cwd:-${CLAUDE_PROJECT_DIR:-.}}" || exit 0
cd "$(git rev-parse --show-toplevel)" || exit 0

if ! status=$(git status --porcelain -- plugins/statusline eslint.config.mjs package.json tsconfig.json types); then
  echo "git status に失敗しました" >&2
  exit 2
fi

if [ -z "$status" ]; then
  exit 0
fi

failed=0

for command in \
  "npm run lint" \
  "npm run format" \
  "npm run typecheck" \
  "claude plugin test plugins/statusline"; do
  if ! output=$($command 2>&1); then
    echo "### $command" >&2
    tail -n 60 <<<"$output" >&2
    failed=1
  fi
done

exit $((failed * 2))
