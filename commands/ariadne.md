---
description: Report what your installed MCP servers actually cost this session
allowed-tools: Bash(ariadne:*), Bash(bun:*)
---

Run `ariadne report` for this session and show it to me exactly as printed,
with no summarising:

!`bun "$CLAUDE_PLUGIN_ROOT/src/cli.ts" report --session "$CLAUDE_SESSION_ID"`

If the report says there are no measurements yet, tell me to run
`bun "$CLAUDE_PLUGIN_ROOT/src/cli.ts" backfill` to import the connection history
Claude Code has already been keeping.

Do not interpret the findings beyond what they say. Each one names its own
evidence, and the numbers are the point.
