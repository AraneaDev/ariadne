import { appendConn, writeProbes } from '../ledger'
import { projectSlug } from '../paths'
import type { ConnEvent, ProbeEvent } from '../types'
import { parseRoster, resolveSpawn } from './roster'
import { probeStdio } from './stdio'

/** Budget for the roster call. `claude mcp list` health-checks, so it is not instant. */
const ROSTER_TIMEOUT_MS = 30_000

/**
 * Ask Claude Code what is configured.
 * @returns The raw stdout, or an empty string when the CLI is not reachable.
 */
async function rosterOutput(): Promise<string> {
  try {
    const proc = Bun.spawn(['claude', 'mcp', 'list'], { stdout: 'pipe', stderr: 'ignore' })
    const text = await Promise.race([
      new Response(proc.stdout).text(),
      Bun.sleep(ROSTER_TIMEOUT_MS).then(() => ''),
    ])
    try { proc.kill() } catch { /* already gone */ }
    return text
  } catch {
    return ''
  }
}

/**
 * Measure every configured server once, out of band, and write the result.
 *
 * Runs detached from session start. It never blocks a session, never prints, and
 * never speaks to the model. A server it cannot reach is recorded with the reason
 * it could not be reached, because an absent number is honest and an estimated one
 * is not.
 * @param cwd The project directory.
 * @param sessionId The session this measurement belongs to.
 */
export async function runProbes(cwd: string, sessionId: string): Promise<void> {
  const roster = parseRoster(await rosterOutput())
  if (roster.length === 0) return

  const project = projectSlug(cwd)
  const ts = new Date().toISOString()
  const base = { v: 1 as const, ts, session: sessionId, project }
  const probes: ProbeEvent[] = []

  for (const entry of roster) {
    const conn: ConnEvent = {
      ...base, t: 'conn', source: 'probe',
      server: entry.server, transport: entry.transport,
      ok: entry.connected, err: entry.err,
    }
    appendConn(conn)

    const shared = { ...base, t: 'probe' as const, source: 'probe' as const, server: entry.server, transport: entry.transport }

    if (entry.transport !== 'stdio') {
      // A remote is reached with credentials Ariadne does not hold and will not read.
      probes.push({ ...shared, ok: false, connect_ms: null, tool_count: 0, defs_bytes: 0, tools: [], reason: 'oauth-unreachable' })
      continue
    }

    const spec = resolveSpawn(entry.server, cwd)
    if (!spec) {
      probes.push({ ...shared, ok: false, connect_ms: null, tool_count: 0, defs_bytes: 0, tools: [], reason: 'config-unresolved' })
      continue
    }

    const r = await probeStdio(spec)
    probes.push({
      ...shared,
      ok: r.ok, connect_ms: r.connect_ms, tool_count: r.tool_count,
      defs_bytes: r.defs_bytes, tools: r.tools,
      ...(r.reason ? { reason: r.reason } : {}),
    })
  }

  writeProbes(sessionId, probes)
}

if (import.meta.main) {
  try {
    await runProbes(process.cwd(), process.env.CLAUDE_SESSION_ID ?? `probe-${Date.now()}`)
  } catch {
    // A failed probe costs a standing-cost figure and nothing else.
  }
  process.exit(0)
}
