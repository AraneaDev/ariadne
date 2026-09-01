---
description: Report what your installed MCP servers actually cost this session
allowed-tools: Bash(ariadne:*), Bash(bun:*)
---

!`bun "$CLAUDE_PLUGIN_ROOT/src/cli.ts" report --session "$CLAUDE_CODE_SESSION_ID"`

Print the output above in a fenced code block, byte for byte.

Its labels and its figures line up on runs of spaces, so reflowing it into a
paragraph or a markdown table destroys the thing being shown. Keep every line
break and every run of spaces exactly as printed. Do not summarise it, do not
rewrap it, and do not recompute any number.

Say nothing after it unless one of these applies. Do not interpret the findings
beyond what they say: each one names its own evidence, and the numbers are the
point.

If the report says there are no measurements yet, say so, and mention that
`bun "$CLAUDE_PLUGIN_ROOT/src/cli.ts" backfill` imports the connection history
Claude Code has already been keeping.

If the user asked a question, answer it after the block.
