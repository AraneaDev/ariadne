import { createHash } from 'node:crypto'
import type { ProbeFailure, ToolShape } from '../types'

/** How to start one stdio server. Held in memory only, never written to the ledger. */
export interface SpawnSpec {
  command: string
  args: string[]
  env: Record<string, string>
}

/** What one stdio measurement produced. */
export interface StdioProbeResult {
  ok: boolean
  connect_ms: number | null
  tool_count: number
  defs_bytes: number
  tools: ToolShape[]
  reason?: ProbeFailure
}

/** Default budget for one server. Generous, because it costs a session nothing. */
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Serialise an object with its keys in a fixed order, at every depth.
 *
 * Two servers exposing the same schema should hash the same whatever order their
 * JSON happened to arrive in, otherwise "twice over" would miss every real
 * duplicate that was merely written differently.
 * @param value Any JSON value.
 * @returns A canonical JSON string.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

/**
 * Measure a `tools/list` payload.
 *
 * Names, descriptions and schema hashes are kept: they are the server's published
 * interface, and both "larger than advertised" and "twice over" need them. The
 * schema itself is hashed rather than stored, because its size is what matters and
 * a copy of every schema on disk buys nothing.
 * @param tools The `tools` array from a `tools/list` result.
 * @returns The per-tool shapes and the total bytes injected per request.
 */
export function shapeTools(tools: unknown): { tools: ToolShape[]; defs_bytes: number } {
  if (!Array.isArray(tools)) return { tools: [], defs_bytes: 0 }
  const shapes: ToolShape[] = []
  for (const raw of tools) {
    if (raw === null || typeof raw !== 'object') continue
    const t = raw as { name?: unknown; description?: unknown; inputSchema?: unknown }
    const name = typeof t.name === 'string' ? t.name : ''
    if (!name) continue
    const desc = typeof t.description === 'string' ? t.description : ''
    const schema = canonical(t.inputSchema ?? {})
    shapes.push({
      name,
      desc,
      desc_bytes: Buffer.byteLength(desc, 'utf8'),
      schema_bytes: Buffer.byteLength(schema, 'utf8'),
      schema_hash: createHash('sha256').update(schema).digest('hex').slice(0, 16),
    })
  }
  return { tools: shapes, defs_bytes: Buffer.byteLength(JSON.stringify(tools), 'utf8') }
}

/**
 * Connect to one stdio server, ask what it exposes, and leave.
 *
 * This is the only way to learn the standing cost: the session transcript carries
 * no tool schemas, and no Claude Code log records a `tools/list` payload. The
 * process is always killed, on every path, because a prober that leaks children is
 * worse than no standing-cost figure.
 * @param spec How to start the server.
 * @param timeoutMs Budget for the whole exchange.
 * @returns The measurement, or a recorded reason there is none.
 */
export async function probeStdio(spec: SpawnSpec, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<StdioProbeResult> {
  const empty = { connect_ms: null, tool_count: 0, defs_bytes: 0, tools: [] as ToolShape[] }
  const started = Date.now()
  let child: Bun.Subprocess<'pipe', 'pipe', 'ignore'> | null = null

  try {
    child = Bun.spawn([spec.command, ...spec.args], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'ignore',
      env: { ...process.env, ...spec.env },
    })

    const write = (value: unknown): void => {
      child?.stdin.write(`${JSON.stringify(value)}\n`)
      child?.stdin.flush()
    }

    write({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ariadne', version: '0.0.1' },
      },
    })

    const seen = new Map<number, unknown>()
    let requestedTools = false
    const reader = (async (): Promise<void> => {
      let buffer = ''
      for await (const chunk of child!.stdout) {
        buffer += new TextDecoder().decode(chunk)
        let nl = buffer.indexOf('\n')
        while (nl !== -1) {
          const line = buffer.slice(0, nl)
          buffer = buffer.slice(nl + 1)
          nl = buffer.indexOf('\n')
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line) as { id?: number; result?: unknown }
            if (typeof msg.id === 'number' && 'result' in msg) seen.set(msg.id, msg.result)
          } catch {
            // A line that is not JSON-RPC is not an answer. Keep reading.
          }
        }
        if (seen.has(1) && !requestedTools) {
          requestedTools = true
          write({ jsonrpc: '2.0', method: 'notifications/initialized' })
          write({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        }
        if (seen.has(2)) return
      }
    })()

    const timedOut = Symbol('timeout')
    const outcome = await Promise.race([reader, Bun.sleep(timeoutMs).then(() => timedOut)])

    if (outcome === timedOut) {
      return { ok: false, ...empty, reason: 'timeout' }
    }
    const result = seen.get(2) as { tools?: unknown } | undefined
    if (!result) {
      return { ok: false, ...empty, reason: 'handshake-failed' }
    }
    const { tools, defs_bytes } = shapeTools(result.tools)
    return { ok: true, connect_ms: Date.now() - started, tool_count: tools.length, defs_bytes, tools }
  } catch {
    return { ok: false, ...empty, reason: 'handshake-failed' }
  } finally {
    try { child?.kill() } catch { /* already gone */ }
  }
}
