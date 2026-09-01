import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dayFile, paths, safeSegment } from './paths'
import type { CallEvent, ConnEvent, ProbeEvent } from './types'

/**
 * Append one JSON line, or give up silently.
 *
 * Every write in Ariadne is best effort. An unwritable ledger costs a measurement.
 * A throwing hook costs the session, which is a far worse trade.
 * @param dir The directory holding the daily file.
 * @param value The event to serialise.
 */
function appendDaily(dir: string, value: object): void {
  try {
    mkdirSync(dir, { recursive: true })
    appendFileSync(dayFile(dir, new Date()), `${JSON.stringify(value)}\n`)
  } catch {
    // Dropping an event is the correct failure. Never surface it.
  }
}

/**
 * Read every JSON line under a directory, skipping anything unparseable.
 *
 * A corrupt line is a line, not a ledger. A half-written record from a killed
 * process must not take the whole report down with it.
 * @param dir The directory to read.
 * @returns Every parsed object, in file then line order.
 */
function readAll<T>(dir: string): T[] {
  const out: T[] = []
  try {
    if (!existsSync(dir)) return out
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith('.jsonl')) continue
      let raw: string
      try {
        raw = readFileSync(join(dir, name), 'utf8')
      } catch {
        continue
      }
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          out.push(JSON.parse(line) as T)
        } catch {
          // One bad line, not a bad ledger.
        }
      }
    }
  } catch {
    // An unreadable directory reports as an empty one.
  }
  return out
}

/**
 * Record one tool call.
 * @param e The call event.
 */
export function appendCall(e: CallEvent): void {
  appendDaily(paths().calls, e)
}

/**
 * Record one connection outcome.
 * @param e The connection event.
 */
export function appendConn(e: ConnEvent): void {
  appendDaily(paths().conns, e)
}

/**
 * Write a session's probe results.
 *
 * Probes get a per-session file rather than a shared daily one because a
 * `tools/list` measurement runs to tens of kilobytes, and an append that large is
 * no longer atomic against a concurrent writer. One writer per file, no
 * interleaving, no locking.
 * @param sessionId The session these probes belong to.
 * @param events The probe events to write.
 */
export function writeProbes(sessionId: string, events: ProbeEvent[]): void {
  if (events.length === 0) return
  try {
    const dir = paths().probes
    mkdirSync(dir, { recursive: true })
    const body = events.map((e) => `${JSON.stringify(e)}\n`).join('')
    writeFileSync(join(dir, `${safeSegment(sessionId, 'session')}.jsonl`), body)
  } catch {
    // A lost probe costs a standing-cost figure, nothing more.
  }
}

/**
 * Every recorded call.
 * @returns All call events in the ledger.
 */
export function readCalls(): CallEvent[] {
  return readAll<CallEvent>(paths().calls)
}

/**
 * Every recorded connection outcome.
 * @returns All connection events in the ledger.
 */
export function readConns(): ConnEvent[] {
  return readAll<ConnEvent>(paths().conns)
}

/**
 * Every recorded probe.
 * @returns All probe events in the ledger.
 */
export function readProbes(): ProbeEvent[] {
  return readAll<ProbeEvent>(paths().probes)
}
