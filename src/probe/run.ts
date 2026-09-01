import { appendConn, writeProbes } from '../ledger'
import { projectSlug } from '../paths'
import type { ConnEvent, ProbeEvent, ProbeFailure, Transport } from '../types'
import { parseRoster, resolveSpawn } from './roster'
import { probeStdio } from './stdio'

/**
 * Whether a roster entry can be probed at all, and if not, why.
 *
 * Only a stdio server can be measured: the prober speaks stdio only. An HTTP or
 * SSE server is `remote-unmeasured` regardless of whether it happens to use
 * OAuth, because the prober has no way to tell and no business asserting it.
 * @param transport The entry's transport.
 * @returns The reason it cannot be probed, or null when it can.
 */
export function unprobeableReason(transport: Transport): ProbeFailure | null {
  return transport === 'stdio' ? null : 'remote-unmeasured'
}

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

    const unprobeable = unprobeableReason(entry.transport)
    if (unprobeable) {
      probes.push({ ...shared, ok: false, connect_ms: null, tool_count: 0, defs_bytes: 0, tools: [], reason: unprobeable })
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

/**
 * The project directory a session-start probe should measure.
 *
 * `session-start.sh` runs this file after `cd`-ing into the plugin's own
 * directory, so `process.cwd()` there names the plugin cache, not the project.
 * Claude Code exports `CLAUDE_PROJECT_DIR` for exactly this, and the script
 * passes it through; `process.cwd()` is only the fallback for a shell that
 * invoked this file some other way.
 * @param env The process environment.
 * @returns The directory to probe.
 */
export function probeCwd(env: NodeJS.ProcessEnv): string {
  return env.CLAUDE_PROJECT_DIR || process.cwd()
}

/**
 * The session id a session-start probe should be filed under.
 *
 * Claude Code exports `CLAUDE_CODE_SESSION_ID`, not `CLAUDE_SESSION_ID`. A probe
 * filed under a session id no report will ever ask for is a probe that never
 * shows up in one.
 * @param env The process environment.
 * @returns The session id to record probes under.
 */
export function probeSessionId(env: NodeJS.ProcessEnv): string {
  return env.CLAUDE_CODE_SESSION_ID || `probe-${Date.now()}`
}

if (import.meta.main) {
  try {
    await runProbes(probeCwd(process.env), probeSessionId(process.env))
  } catch {
    // A failed probe costs a standing-cost figure and nothing else.
  }
  process.exit(0)
}
