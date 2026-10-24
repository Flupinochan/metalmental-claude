#!/usr/bin/env bash

input=$(cat)

# 修正を促した直後の再実行では何もせず、停止を許可して無限ループを防ぐ
if grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' <<<"$input"; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if [ -z "$(git status --porcelain -- plugins/statusline eslint.config.mjs package.json tsconfig.json types)" ]; then
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
