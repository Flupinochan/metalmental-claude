#!/bin/bash
# SessionStart hook: install git pre-commit guard hook (idempotent)

set -euo pipefail

MARKER="# [commit-enforce]"
GIT_HOOKS_DIR=".git/hooks"
PRE_COMMIT="$GIT_HOOKS_DIR/pre-commit"

# Skip if not in a git repo
if [ ! -d "$GIT_HOOKS_DIR" ]; then
  exit 0
fi

# Create enabled marker in CLAUDE_PLUGIN_DATA (auto-deleted on plugin uninstall)
ENABLED_FILE="${CLAUDE_PLUGIN_DATA}/enabled"
mkdir -p "${CLAUDE_PLUGIN_DATA}"
touch "$ENABLED_FILE"

# Skip if already installed
if [ -f "$PRE_COMMIT" ] && grep -qF "$MARKER" "$PRE_COMMIT"; then
  exit 0
fi

# Create file with shebang if it does not exist
if [ ! -f "$PRE_COMMIT" ]; then
  printf '#!/bin/sh\n' > "$PRE_COMMIT"
fi

# ENABLED_FILE path is expanded at install time so the hook works without Claude Code
printf '\n' >> "$PRE_COMMIT"
cat >> "$PRE_COMMIT" << EOF
$MARKER
if [ -f "${ENABLED_FILE}" ] && [ -z "\$CLAUDE_COMMIT_ALLOWED" ]; then
  echo "Direct git commit is disabled. Use /commit-enforce in Claude Code." >&2
  exit 1
fi
EOF

# Ensure the hook is executable
chmod +x "$PRE_COMMIT"
