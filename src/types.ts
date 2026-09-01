/** Which of the three sources produced a record. Provenance travels with the event. */
export type Source = 'hook' | 'probe' | 'cc-log'

/** How a server is reached. Anything unrecognised is `other`. */
export type Transport = 'stdio' | 'http' | 'sse' | 'other'

/** Fields every event in the ledger carries. */
export interface BaseEvent {
  /** Schema version. Bumped only on a breaking change to any event shape. */
  v: 1
  ts: string
  session: string
  project: string
  source: Source
}

/**
 * One tool call.
 *
 * `in_bytes` and `out_bytes` are lengths, never content. See the privacy invariants,
 * arguments and results are measured and discarded, never written.
 */
export interface CallEvent extends BaseEvent {
  t: 'call'
  /** The MCP server name, or null for a Claude Code built-in. */
  server: string | null
  tool: string
  builtin: boolean
  /** Wall time from PreToolUse to PostToolUse, or null when the pair was not matched. */
  ms: number | null
  in_bytes: number
  out_bytes: number
  ok: boolean
  /** A short error class, never the error text. */
  err: string | null
  id: string
}

/** One tool as the server declared it. Descriptions are public interface, not user data. */
export interface ToolShape {
  name: string
  desc: string
  desc_bytes: number
  schema_bytes: number
  schema_hash: string
}

/** Why a server could not be measured. */
export type ProbeFailure = 'oauth-unreachable' | 'config-unresolved' | 'timeout' | 'handshake-failed'

/** One `tools/list` measurement, or a recorded reason there is none. */
export interface ProbeEvent extends BaseEvent {
  t: 'probe'
  server: string
  transport: Transport
  ok: boolean
  connect_ms: number | null
  tool_count: number
  /** Bytes of the tool definitions this server injects into every request. */
  defs_bytes: number
  tools: ToolShape[]
  reason?: ProbeFailure
}

/** One connection outcome, from the prober or from Claude Code's own logs. */
export interface ConnEvent extends BaseEvent {
  t: 'conn'
  server: string
  transport: Transport
  ok: boolean
  /** A short error class, never a command line. */
  err: string | null
}

/** Anything the ledger holds. */
export type AriadneEvent = CallEvent | ProbeEvent | ConnEvent

/** The subset of a Claude Code hook payload Ariadne reads. All fields optional by design. */
export interface HookPayload {
  hook_event_name?: string
  session_id?: string
  cwd?: string
  tool_name?: string
  tool_input?: unknown
  tool_response?: unknown
  tool_use_id?: string
  error?: string
  is_interrupt?: boolean
}
