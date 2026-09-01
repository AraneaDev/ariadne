#!/bin/sh
# Build ladder, then the prober.
#
# The hot path is a compiled binary that is gitignored because it is large, so the
# first session after install builds it. Every rung ends in exit 0, because a
# plugin that cannot start must still not stop a session from starting.
set -u

root=${CLAUDE_PLUGIN_ROOT:-}
[ -n "$root" ] || exit 0

# Drain stdin so the caller never blocks on a full pipe.
cat >/dev/null 2>&1

if ! command -v bun >/dev/null 2>&1; then
  printf '%s\n' '{"systemMessage":"ariadne is inert: bun was not found on PATH. Install bun and restart the session."}'
  exit 0
fi

if [ ! -x "$root/bin/ariadne-hook" ]; then
  # Background, so a first session never waits on a compile.
  ( cd "$root" && bun run scripts/build-hook.ts >/dev/null 2>&1 ) &
  printf '%s\n' '{"systemMessage":"ariadne is building its hook binary in the background. It will be active from the next session."}'
  exit 0
fi

# Measure standing cost out of band. Detached and silent: it must never delay a
# session, and it has nothing to say to the model.
( cd "$root" && bun run src/probe/run.ts >/dev/null 2>&1 ) &

exit 0
