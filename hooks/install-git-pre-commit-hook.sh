#!/bin/bash
# SessionStart hook: install git pre-commit guard hook (idempotent)

set -euo pipefail

MARKER="# [claude-only-commit-workflow]"
GIT_HOOKS_DIR=".git/hooks"
PRE_COMMIT="$GIT_HOOKS_DIR/pre-commit"

# Skip if not in a git repo
if [ ! -d "$GIT_HOOKS_DIR" ]; then
  exit 0
fi

# Skip if already installed
if [ -f "$PRE_COMMIT" ] && grep -qF "$MARKER" "$PRE_COMMIT"; then
  exit 0
fi

# Create file with shebang if it does not exist
if [ ! -f "$PRE_COMMIT" ]; then
  printf '#!/bin/sh\n' > "$PRE_COMMIT"
fi

# Append guard block to the pre-commit hook
cat >> "$PRE_COMMIT" << EOF
$MARKER
if [ -z "\$CLAUDE_COMMIT_ALLOWED" ]; then
  echo "Direct git commit is disabled. Use /commit in Claude Code." >&2
  exit 1
fi
EOF

# Ensure the hook is executable
chmod +x "$PRE_COMMIT"
