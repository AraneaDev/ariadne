# Ariadne

Measures what your installed MCP servers actually cost you, after install, in
real sessions.

MCP Observatory grades a server before you install it. Ariadne measures the one
you already run.

## What it measures

Per server, per session or across every project on the machine:

- **standing cost**, the bytes of tool definitions injected into every request
  before any work happens
- **reach**, tools exposed against tools ever called
- **calls**, count and per tool
- **latency**, p50 and p95, above a minimum sample only
- **result size**, the distribution and the largest single result
- **share**, cumulative bytes returned as a fraction of MCP bytes returned

Claude Code's own built-in tools are measured on the same axes, as a baseline.
They make the MCP numbers legible, and they never produce a finding, because you
cannot uninstall a built-in.

## What it reports

The table is the boring half. The findings under it are the reason to run it,
and each one names its evidence:

- **paid for, never used.** Five servers were connected all session, four were
  never called, and those four cost N tokens per turn regardless.
- **larger than advertised.** A tool describes itself in nine words and returns
  38 KB on average.
- **configured, absent.** A server has failed to connect for six days. Its tools
  have not existed for any of them.
- **twice over.** Two servers expose a tool that does the same thing.

## How it works

Three sources, one append-only ledger under `~/.ariadne/`.

Hooks record every tool call: its timing, the size of what went in and what came
back, and whether it failed. A prober connects to each configured server at
session start, out of band, asks what it exposes, measures the payload and
disconnects. That is the only way to learn the standing cost, because no
transcript and no log records a `tools/list` payload.

The third source is Claude Code's own MCP logs, which have been recording
connection attempts on your machine for weeks. Ariadne reads them, which is why
it can print a real report on its first run rather than asking you to wait a
week. That source is undocumented and may move, so it only ever enriches. If it
disappears, the history goes and every other number stands.

## Install

```bash
/plugin marketplace add AraneaDev/ariadne
/plugin install ariadne
```

The first session after install builds the hook binary in the background and
tells you so. From the next session, Ariadne is recording.

Then import what Claude Code already knows:

```bash
ariadne backfill
```

A backfill and a probe are enough for standing cost and connection history to
show up in the report immediately. Reach, latency and result sizes are
different: they come from the hooks, and the hooks only have something to say
once you have run real sessions with real tool calls in them. A report run
right after install will show `0` calls for every server. That is the correct
number for a server nothing has called yet, not a sign that something is
broken.

## Use

```bash
/ariadne                    # this session, inside Claude Code
ariadne report               # everything, from a shell
ariadne report --project x   # one project
ariadne probe                # measure standing cost right now
ariadne purge                # delete the ledger
```

## What it never does

- It does not disable a server or edit a config. Cutting a server is your
  decision.
- It records the size of tool arguments, never the arguments themselves.
- It records the size of tool results, never the results themselves. What came
  back is usually the most sensitive thing in a session, and a monitor that logs
  payloads is a second copy of your data in a place nobody is guarding.
- It does not record server command lines, environments or URLs. `claude mcp
  list` prints API keys in its command column, and anything that logged what it
  enumerated would copy them somewhere they are not guarded.
- It does not send anything anywhere. There is no network code beyond the
  prober's connections to your own configured servers, and no export format.
- It does not grade a server. It measures. A grade from one machine's traffic
  would be a number pretending to be a judgement.
- It does not add anything to your context window unless you asked for a report.
  A tool whose subject is the cost of things sitting in your context has no
  business sitting in it. The one exception is the first session after install,
  which prints a single system message while its hook binary builds in the
  background, and never again after that.

Tool names and schema shapes are recorded, deliberately. They are the server's
published interface rather than your data, and the findings about oversized
results and duplicated servers cannot be computed without them. A description's
byte length is recorded for the same reason; the description text itself is
not, because a server that templates its own configuration into its tool text
could otherwise write a path or a URL straight into the ledger through a field
no finding needs to read.

## Honest limits

Token counts are estimates. Bytes are exact, and the byte figure is printed
beside every token figure.

A tool called once is not a measurement. Every finding declares a minimum sample
and stays silent below it, so you will never see a p95 over four calls.

Attribution of window pressure is approximate. Ariadne knows what a server
returned, not what the model then did with it, and a large result summarised
early costs less than its size suggests.

Latency includes the work the server actually did, so a slow server and a server
doing something hard look identical from here.

Standing cost for remote servers is unmeasured. The prober speaks stdio only,
so an HTTP or SSE server, whether or not it uses OAuth, gets a row that says
`unmeasured` rather than a guess.

Standing cost for plugin-provided MCP servers is unmeasured too. The prober
resolves a server's launch command from project `.mcp.json` and user
`~/.claude.json` only; a server supplied by a plugin keeps its configuration
inside the plugin's own directory instead, so those rows say `unmeasured
(config-unresolved)`. On the machine this was built on, that was three servers
out of twelve.

Duplicate detection matches on tool names and schema hashes. A near-copy under an
unrelated name is not caught.

## Licence

MIT.
