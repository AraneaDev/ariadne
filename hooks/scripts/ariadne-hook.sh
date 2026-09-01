#!/bin/sh
# Shim for the PreToolUse and PostToolUse hooks.
#
# hooks.json routes both events through this script rather than the compiled
# binary directly, because bin/ariadne-hook is gitignored and built in the
# background by session-start.sh. Until it exists, every tool call in the first
# session would otherwise fail twice with exit 127. This execs the binary once
# it is there and exits 0 silently when it is not, because a plugin that cannot
# start yet must still not fail a tool call.
set -u

root=${CLAUDE_PLUGIN_ROOT:-}
bin="$root/bin/ariadne-hook"

if [ -n "$root" ] && [ -x "$bin" ]; then
  exec "$bin"
fi

# Drain stdin, so the caller never blocks on a full pipe or sees a broken one.
cat >/dev/null 2>&1
exit 0
