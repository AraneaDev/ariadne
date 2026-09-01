import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { appendConn, readConns } from './ledger'
import { errorClass } from './measure'
import { projectSlug } from './paths'
import type { ConnEvent, Transport } from './types'

/**
 * Where Claude Code keeps its own per-server MCP logs.
 *
 * This path is undocumented and can move between releases. Everything downstream
 * of it treats a miss as normal: backfill is enrichment, never a requirement. If
 * this directory disappears, Ariadne loses history and no current number.
 * @returns The log root, honouring `ARIADNE_CC_LOGS` for tests.
 */
export function ccLogRoot(): string {
  const explicit = process.env.ARIADNE_CC_LOGS
  if (explicit) return explicit
  const h = process.env.HOME
  const home = h && isAbsolute(h) ? h : homedir()
  return join(home, '.cache', 'claude-cli-nodejs')
}

/** The transports this codebase understands. Anything else is `other`. */
const TRANSPORTS = new Set<Transport>(['stdio', 'http', 'sse', 'other'])

/**
 * Constrain a captured transport name to the closed union.
 * @param raw The regex capture, which is arbitrary text.
 * @returns A member of the union, defaulting to `other`.
 */
function toTransport(raw: string | undefined): Transport {
  return raw !== undefined && TRANSPORTS.has(raw as Transport) ? (raw as Transport) : 'other'
}

/** `Successfully connected (transport: stdio) in 405ms` */
const CONNECTED = /Successfully connected \(transport: (\w+)\)/
/** Anything that reads as a connection giving up. */
const FAILED = /Connection (?:failed|closed|error)|failed to connect/i

/**
 * Turn one log line into a connection event, or null when it is not one.
 *
 * Only connection outcomes are imported. The logs also carry `Calling MCP tool:`
 * lines, which look tempting as retroactive call data, but they hold no timing and
 * no result size, so importing them would put rows in the ledger that no report
 * could say anything about.
 * @param line One raw JSON line.
 * @param server The server the containing directory names.
 * @param project The project tag fallback, used only when the record has no cwd.
 * @returns A connection event, or null.
 */
export function parseCcLogLine(line: string, server: string, project: string): ConnEvent | null {
  let rec: { debug?: unknown; error?: unknown; timestamp?: unknown; sessionId?: unknown; cwd?: unknown }
  try {
    rec = JSON.parse(line) as typeof rec
  } catch {
    return null
  }

  const text = [rec.debug, rec.error].filter((v): v is string => typeof v === 'string').join(' ')
  if (!text) return null

  const connected = CONNECTED.exec(text)
  const failed = FAILED.test(text)
  if (!connected && !failed) return null

  const cwd = typeof rec.cwd === 'string' ? rec.cwd : ''
  // Prefer the record's own cwd, so a backfilled event lands in the same project as
  // the hook events for that directory. The directory name is a path with its slashes
  // swapped for dashes, and a raw path has no business in the ledger.
  const tag = cwd ? projectSlug(cwd) : project

  return {
    v: 1,
    t: 'conn',
    ts: typeof rec.timestamp === 'string' ? rec.timestamp : new Date(0).toISOString(),
    session: typeof rec.sessionId === 'string' ? rec.sessionId : '',
    project: tag,
    source: 'cc-log',
    server,
    transport: toTransport(connected?.[1]),
    ok: Boolean(connected),
    err: connected ? null : errorClass(text),
  }
}

/**
 * A stable identity for one connection event, for deduplication.
 * @param e The event.
 * @returns A key that repeats only for the same recorded outcome.
 */
function key(e: ConnEvent): string {
  return `${e.ts}|${e.server}|${e.session}|${e.ok}`
}

/**
 * List directory entries, or nothing when it cannot be read.
 * @param dir The directory.
 * @returns Its entry names.
 */
function safeList(dir: string): string[] {
  try {
    return existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir) : []
  } catch {
    return []
  }
}

/**
 * Import connection history from Claude Code's own logs.
 *
 * This is what lets Ariadne print a real report on its first run, from history you
 * already have, instead of asking you to accumulate a week of sessions first.
 *
 * Idempotent: an event already in the ledger is skipped, so running it repeatedly
 * costs a read and adds nothing.
 * @returns How many events were added and how many files were scanned.
 */
export function backfill(): { added: number; scanned: number } {
  const root = ccLogRoot()
  const seen = new Set(readConns().map(key))
  let added = 0
  let scanned = 0

  for (const projectDir of safeList(root)) {
    const fallback = `unknown-${createHash('sha256').update(projectDir).digest('hex').slice(0, 8)}`
    for (const serverDir of safeList(join(root, projectDir))) {
      const m = /^mcp-logs-(.+)$/.exec(serverDir)
      if (!m?.[1]) continue
      const server = m[1]
      for (const file of safeList(join(root, projectDir, serverDir))) {
        if (!file.endsWith('.jsonl')) continue
        scanned += 1
        let raw: string
        try {
          raw = readFileSync(join(root, projectDir, serverDir, file), 'utf8')
        } catch {
          continue
        }
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue
          const event = parseCcLogLine(line, server, fallback)
          if (!event) continue
          const k = key(event)
          if (seen.has(k)) continue
          seen.add(k)
          appendConn(event)
          added += 1
        }
      }
    }
  }

  return { added, scanned }
}
