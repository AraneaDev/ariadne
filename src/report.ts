import { readCalls, readConns, readProbes } from './ledger'
import { estimateTokens, findings, serverKey, type LedgerSlice } from './findings'
import type { CallEvent, ProbeEvent } from './types'

/**
 * Format a number with thousands separators.
 * @param value The number.
 * @returns The grouped string.
 */
function n(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * Read a slice of the ledger.
 * @param opts Restrict to one session or one project. Both omitted reads everything.
 * @param opts.session Restrict to this session id, when given.
 * @param opts.project Restrict to this project slug, when given.
 * @returns The matching events.
 */
export function sliceFor(opts: { session?: string; project?: string } = {}): LedgerSlice {
  const keep = <T extends { session: string; project: string }>(e: T): boolean =>
    (opts.session === undefined || e.session === opts.session)
    && (opts.project === undefined || e.project === opts.project)
  return {
    calls: readCalls().filter(keep),
    probes: readProbes().filter(keep),
    conns: readConns().filter(keep),
  }
}

/**
 * One row of the per-server table.
 * @param probe The latest probe for the server, if any.
 * @param server The server's display name.
 * @param calls Every call to that server.
 * @returns The rendered line.
 */
function serverRow(probe: ProbeEvent | undefined, server: string, calls: CallEvent[]): string {
  const reached = new Set(calls.map((c) => c.tool)).size
  const failures = calls.filter((c) => !c.ok).length
  const out = calls.reduce((sum, c) => sum + c.out_bytes, 0)
  const latencies = calls.map((c) => c.ms).filter((m): m is number => m !== null).sort((a, b) => a - b)
  const p50 = latencies.length >= 5 ? `${latencies[Math.floor(latencies.length / 2)]}ms` : '-'

  const standing = probe === undefined
    ? 'not probed'
    : probe.ok
      ? `${n(probe.defs_bytes)} bytes (~${n(estimateTokens(probe.defs_bytes))} estimated tokens)`
      : `unmeasured (${probe.reason ?? 'unknown'})`

  const reach = probe?.ok ? `${reached}/${probe.tool_count}` : `${reached}/?`

  return [
    `  ${server}`,
    `    standing cost   ${standing}`,
    `    reach           ${reach} tools`,
    `    calls           ${n(calls.length)}${failures ? `, ${n(failures)} failed` : ''}`,
    `    returned        ${n(out)} bytes (~${n(estimateTokens(out))} estimated tokens)`,
    `    latency p50     ${p50}`,
  ].join('\n')
}

/**
 * Render the whole report.
 *
 * The table is the boring half. The findings under it are why anyone runs this,
 * and each one names the evidence it rests on.
 *
 * Every grouping and match here goes through `serverKey`, never the raw server
 * string. One server can arrive spelled three different ways depending on which
 * source produced the record (Claude Code's logs, `claude mcp list`, or a hook
 * tool name), and matching on the raw string would print it as two servers.
 * @param slice The ledger slice to describe.
 * @returns The printable report.
 */
export function renderReport(slice: LedgerSlice): string {
  if (slice.calls.length === 0 && slice.probes.length === 0 && slice.conns.length === 0) {
    return 'ariadne: No measurements yet. Run `ariadne backfill` to import connection history, or start a session to record calls.\n'
  }

  const latest = new Map<string, ProbeEvent>()
  for (const p of slice.probes) {
    const key = serverKey(p.server)
    const prev = latest.get(key)
    if (!prev || p.ts > prev.ts) latest.set(key, p)
  }

  const mcpCalls = slice.calls.filter((c) => !c.builtin && c.server !== null)

  // Prefer the probe's spelling for display, since that comes from the roster
  // (`claude mcp list`), and fall back to whatever a call's source used.
  const displayName = new Map<string, string>()
  for (const p of slice.probes) {
    const key = serverKey(p.server)
    if (!displayName.has(key)) displayName.set(key, p.server)
  }
  for (const c of mcpCalls) {
    const key = serverKey(c.server as string)
    if (!displayName.has(key)) displayName.set(key, c.server as string)
  }

  const servers = new Set<string>([...latest.keys(), ...mcpCalls.map((c) => serverKey(c.server as string))])

  const lines: string[] = ['ariadne', '']
  for (const key of [...servers].sort((a, b) => (displayName.get(a) ?? a).localeCompare(displayName.get(b) ?? b))) {
    const server = displayName.get(key) ?? key
    const calls = mcpCalls.filter((c) => serverKey(c.server as string) === key)
    lines.push(serverRow(latest.get(key), server, calls), '')
  }

  const builtins = slice.calls.filter((c) => c.builtin)
  if (builtins.length > 0) {
    lines.push('Baseline: Claude Code built-in tools', '')
    const byTool = new Map<string, CallEvent[]>()
    for (const c of builtins) {
      const list = byTool.get(c.tool) ?? []
      list.push(c)
      byTool.set(c.tool, list)
    }
    for (const [tool, calls] of [...byTool.entries()].sort()) {
      const total = calls.reduce((sum, c) => sum + c.out_bytes, 0)
      lines.push(`  ${tool}: ${n(calls.length)} calls, ${n(total)} bytes returned, ${n(Math.round(total / calls.length))} bytes median`)
    }
    lines.push('')
  }

  const found = findings(slice)
  lines.push('Findings', '')
  if (found.length === 0) {
    lines.push('  Nothing met its evidence threshold. That is a result, not a failure.', '')
  } else {
    for (const f of found) {
      lines.push(`  ${f.title}`)
      for (const e of f.evidence) lines.push(`    ${e}`)
      lines.push(`    [${f.derivedFrom.join(', ')}]`, '')
    }
  }

  lines.push('Bytes are exact. Token figures are estimates, derived from bytes.')
  return `${lines.join('\n')}\n`
}
