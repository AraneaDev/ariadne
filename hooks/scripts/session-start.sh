#!/bin/sh
# Build ladder, then the prober.
#
# The hot path is a compiled binary that is gitignored because it is large, so the
# first session after install builds it. Every rung always exits successfully, because
# a plugin that cannot start must still not stop a session from starting.
set -u

# Drain stdin first, so the caller never blocks on a full pipe. This has to come
# before every early exit, including the one below, because a path that exits
# without reading hands the writer a broken pipe.
cat >/dev/null 2>&1

root=${CLAUDE_PLUGIN_ROOT:-}
[ -n "$root" ] || exit 0

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
#
# The prober's own cwd becomes the plugin's directory below, so the project it
# should measure has to travel some other way. CLAUDE_PROJECT_DIR is already in
# this script's environment; carry it into the subshell explicitly rather than
# counting on it surviving the `cd` by accident.
project=${CLAUDE_PROJECT_DIR:-}
( cd "$root" && CLAUDE_PROJECT_DIR="$project" bun run src/probe/run.ts >/dev/null 2>&1 ) &

exit 0
