import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { callEventFrom } from './events'
import { appendCall } from './ledger'
import { paths, safeSegment } from './paths'
import type { HookPayload } from './types'

/** How long a start marker can sit unresolved before it belongs to a dead session. */
const PENDING_TTL_MS = 6 * 60 * 60 * 1000

/**
 * The marker path for one tool call.
 * @param toolUseId The call's id, which arrives from outside this process.
 * @returns A path that can only name a child of the pending directory.
 */
function markerPath(toolUseId: string): string {
  return join(paths().pending, safeSegment(toolUseId))
}

/**
 * Drop markers whose PostToolUse never arrived.
 *
 * A session killed between the two hooks leaves a marker behind forever, and
 * nothing else enumerates this directory. Cleaning runs on the write path over a
 * directory that is normally near-empty, and can never throw.
 * @param dir The pending directory.
 */
function prune(dir: string): void {
  try {
    const cutoff = Date.now() - PENDING_TTL_MS
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      try {
        if (statSync(p).mtimeMs < cutoff) rmSync(p, { force: true })
      } catch {
        // A marker that vanished under us needs no cleaning.
      }
    }
  } catch {
    // Cleanup is opportunistic and must never cost a call.
  }
}

/**
 * Note when a call started, so PostToolUse can measure how long it took.
 *
 * The marker holds a timestamp and nothing else. It is the only thing Ariadne
 * writes on the pre-call path, which is the one path where latency is visible to
 * the user.
 * @param toolUseId The call's id.
 */
function markStart(toolUseId: string): void {
  try {
    const dir = paths().pending
    mkdirSync(dir, { recursive: true })
    prune(dir)
    writeFileSync(markerPath(toolUseId), String(Date.now()))
  } catch {
    // A missing marker costs one latency figure.
  }
}

/**
 * Read and remove a call's start marker.
 * @param toolUseId The call's id.
 * @returns Elapsed milliseconds, or null when no usable marker existed.
 */
function takeElapsed(toolUseId: string): number | null {
  try {
    const p = markerPath(toolUseId)
    if (!existsSync(p)) return null
    const started = Number(readFileSync(p, 'utf8').trim())
    rmSync(p, { force: true })
    if (!Number.isFinite(started) || started <= 0) return null
    const ms = Date.now() - started
    return ms >= 0 ? ms : null
  } catch {
    return null
  }
}

/**
 * Route one hook payload.
 *
 * Always returns null. Ariadne measures the cost of things that sit in a context
 * window, so this hook puts nothing in one: no `additionalContext`, no
 * `systemMessage`, no output of any kind, on either event it handles here.
 *
 * The one deliberate exception lives outside this file. `hooks/scripts/session-start.sh`
 * prints a single `systemMessage`, at most once per install, while its own hook
 * binary is still building in the background. That script's job is telling you
 * the plugin cannot start yet; this one's job is never speaking at all.
 * @param payload The hook payload.
 * @returns Always null.
 */
export function handle(payload: HookPayload): null {
  if (payload === null || typeof payload !== 'object') return null
  const id = typeof payload.tool_use_id === 'string' ? payload.tool_use_id : ''

  if (payload.hook_event_name === 'PreToolUse') {
    if (id) markStart(id)
    return null
  }

  if (payload.hook_event_name !== 'PostToolUse') return null

  // An interrupt is not a result. Recording one would add a call that never
  // completed to a distribution meant to describe calls that did.
  if (payload.is_interrupt) {
    if (id) takeElapsed(id)
    return null
  }

  const ms = id ? takeElapsed(id) : null
  const event = callEventFrom(payload, ms)
  if (event) appendCall(event)
  return null
}

if (import.meta.main) {
  // Nothing below may throw or exit non-zero. A hook that fails is a session that fails.
  try {
    handle(JSON.parse(await Bun.stdin.text()) as HookPayload)
  } catch {
    // Unparseable input, unwritable ledger, anything at all: leave quietly.
  }
  process.exit(0)
}
