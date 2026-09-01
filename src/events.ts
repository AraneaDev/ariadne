import { byteLength, errorClass, splitToolName } from './measure'
import { projectSlug } from './paths'
import type { CallEvent, HookPayload } from './types'

/**
 * Build a call event from a hook payload.
 *
 * This is the privacy boundary. Everything the payload carries that is content
 * rather than measurement is consumed here and never leaves: arguments and results
 * become byte counts, error text becomes a class. The returned object is composed
 * of primitives only, so no later stage can write content it was never given.
 *
 * `payload.error` is read here for whatever calls this with one, but Claude
 * Code's own `PostToolUse` payload never carries it: a failed tool call fires
 * the separate `PostToolUseFailure` event instead, which Ariadne does not
 * subscribe to. So `ok` and `err` are structurally always `true` and `null` for
 * every event this hook actually records today; nothing downstream presents
 * them as a measured failure rate.
 * @param payload The hook payload.
 * @param ms Wall time from PreToolUse, or null when the pair was not matched.
 * @returns A recordable event, or null when the payload is not a tool call.
 */
export function callEventFrom(payload: HookPayload, ms: number | null): CallEvent | null {
  const name = payload.tool_name
  if (typeof name !== 'string' || name === '') return null
  const { server, tool, builtin } = splitToolName(name)
  const err = errorClass(payload.error)
  return {
    v: 1,
    t: 'call',
    ts: new Date().toISOString(),
    session: typeof payload.session_id === 'string' ? payload.session_id : '',
    project: projectSlug(typeof payload.cwd === 'string' ? payload.cwd : process.cwd()),
    source: 'hook',
    server,
    tool,
    builtin,
    ms,
    in_bytes: byteLength(payload.tool_input),
    out_bytes: byteLength(payload.tool_response),
    ok: err === null,
    err,
    id: typeof payload.tool_use_id === 'string' ? payload.tool_use_id : '',
  }
}
