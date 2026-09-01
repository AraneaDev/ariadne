# Ariadne

*Daedalus built the labyrinth at Knossos and nobody who went in came out.
Ariadne gave Theseus a thread, and the thread is the only reason the story has
an ending. She did not simplify the maze. She made it possible to know where you
had been.*

**You do not know which MCP server is eating your session.**

- group: `agent-tooling`
- moment: `during`
- shape: MCP proxy, plus a Claude Code plugin for the half a proxy cannot see
- pairs with: MCP Observatory, and with Knossos by myth

## The problem

MCP Observatory grades a server before you install it: where the code came from,
what it asks for, what the scanner found. That judgement is made once, from the
outside, on a repository. Then you install the server and it becomes part of
every session you run, and nothing measures it again.

What goes wrong after install is a different set of things, and none of them are
visible in a registry entry.

A server costs you before you call it once. Every connected server has its tool
definitions injected into the request, each with a name, a description and a
JSON schema. Twelve servers with a dozen tools each is a five-figure token bill
paid on every turn, whether or not a single one of those tools is ever reached
for. That is the tax nobody has a number for, and it is the largest number this
tool would produce.

A tool returns more than its description implies. The description says it lists
containers. The result is 40 KB of JSON that spends a fifth of the window and
gets summarised into one sentence.

A server is configured and simply not there. Argos failed to connect in a
session I ran today, `CONNECTION_CLOSED`, and the only reason I know is that the
harness happened to print it. Nothing tracks that it has been failing for a week,
or that half the tools I think I have are not available.

Two servers do the same job. Observatory already deduplicates servers across npm,
PyPI and the registries because the ecosystem is full of near-copies. The same
duplication ends up installed side by side, and nothing points at it.

## Why this one

It is the post-install half of a tool that is already built and already the odd
one out. MCP Observatory is the only project in the `web-app` band, and it stays
the only one, because the band is a kind rather than a subject. Ariadne gives it
a sibling by subject instead: Observatory judges what you are about to install,
Ariadne measures what you did.

It is also the one idea here whose data is worth something in aggregate.
Observatory grades servers from static evidence, which is the only evidence a
registry has. A field measurement of what a server actually returns is a
stronger signal than any scan of its source, and it is exactly the signal a
public dashboard cannot get on its own. That is a real product line, and it is
also the one place where local-first has to be argued rather than assumed. See
the open questions.

## Design

Two ways in, and they see different things. Both, eventually.

**Hooks, first.** In Claude Code an MCP tool arrives as `mcp__<server>__<tool>`,
so `PreToolUse` and `PostToolUse` see every call, its arguments, its result and
its timing without anything sitting in the transport. This is the cheap half: no
new process, no new failure mode, and it ships as a plugin like Kanon and
Cassandra do.

What hooks cannot see is everything that happens before a call. They do not see
`tools/list`, so they cannot weigh the standing cost, which is the headline
number. They do not see a connection that never opened, because a server that
failed to start makes no tool calls to observe. They see the sessions of one
client only.

**A proxy, second.** Ariadne stands between the client and each configured
server, forwards everything unchanged, and records both directions. Now the
`tools/list` payload is measurable, a handshake that fails is an event rather
than a silence, and any MCP client is covered rather than one.

The cost is honest and has to be stated: a proxy is a hop, it adds latency of
its own, and it is a new thing that can break the servers it watches. It must
subtract its own overhead from every number it reports, and it must fail open,
because a monitor that takes your tools down when it crashes is worse than no
monitor.

The ledger is the same shape either way: append-only JSON lines under
`~/.ariadne/`, one file per day, no interpretation at write time.

## What it measures

Per server:

| | |
|---|---|
| standing cost | bytes and estimated tokens of tool definitions injected per request, and what share of the window that is before any work happens |
| reach | tools exposed against tools ever called, so a server offering thirty and used for two is visible as such |
| calls | count, and per tool |
| latency | p50 and p95, with the proxy's own overhead subtracted |
| result size | distribution, and the single largest result with the call that produced it |
| errors | failure rate, and connections that never opened at all |
| share | cumulative tokens returned, as a fraction of everything that entered the window |

## The report

`/ariadne` prints the current session. The interesting output is not the table,
it is the findings under it, and each one names the evidence:

- **paid for, never used.** Five servers were connected all session, four were
  never called, and those four cost N tokens per turn regardless.
- **larger than advertised.** `mcp__x__list` describes itself in nine words and
  returns 38 KB on average, over sixty times what its description implies.
- **configured, absent.** `argos` has failed to connect on every session for six
  days. Its tools have not existed for any of them.
- **twice over.** Two servers expose a tool that does the same thing. One of them
  is the one you actually call.

The first finding is the one people will install it for. Everything else is a
reason to keep it.

## What it never does

- It does not disable a server or edit a config. It reports, and the decision to
  cut a server is a person's.
- It does not read the content of a tool result beyond its size and shape. What
  came back is often the most sensitive thing in a session, and a monitor that
  logs payloads is a second copy of your data in a place nobody is guarding.
  Sizes, names and timings only.
- It does not send anything anywhere by default. See below.
- It does not grade a server the way Observatory does. It measures. A grade from
  one machine's traffic would be a number pretending to be a judgement.

## Honest limits

Token counts are estimates. Bytes are exact and tokens are not, unless the
client reports usage, so every token figure has to be marked as derived and the
byte figure has to be available beside it. A tool called once is not a
measurement, and a distribution over four calls should say so rather than print
a p95. Attribution of window pressure is approximate: the tool knows what a
server returned, not what the model then did with it, and a large result that
gets summarised early costs less than its size suggests. Latency includes the
work the server actually did, so a slow server and a server doing something hard
look identical from here.

## Open questions

- **Does anything ever leave the machine?** The aggregate measurement is the most
  valuable thing this tool produces and the one thing the local-first argument
  says it should not ship. The only version I would defend is opt-in per server,
  aggregate only, no arguments and no results, with the exact payload printed
  before the first send. If that reads as a compromise on the principle, then it
  does not ship and Ariadne stays entirely local, which is also a fine answer.
- Proxy or hooks first? Hooks are a week and prove the idea. The proxy is where
  the headline number lives. Shipping the plugin alone risks the tool being
  judged on the half that is missing its best feature.
- Per project or per machine? Standing cost is a property of a config, and a
  config is usually per project, but the interesting comparison is across all of
  them.
- Should Claude Code's own built-in tools be measured on the same axes? It would
  make the MCP numbers legible by comparison, and it would answer a question
  nobody has data for either.
- Does the ledger belong beside Cassandra's and Horkos's, or does a third writer
  under a fourth dotfile directory mean the plugins need one store between them?

## Name

Ariadne, and the myth does the work. Knossos maps a codebase so nobody has to
wander it twice; the labyrinth in the story is at Knossos, and the thread is
what makes it survivable. The pairing is already in the catalogue and this is
the tool that completes it.

Theseus was the alternative and is wrong: he kills the thing in the middle. This
tool does not remove anything, it tells you where you have been.
