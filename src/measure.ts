/**
 * Byte length of a value's serialised form.
 *
 * The value is serialised, measured and dropped inside this function. Nothing that
 * enters here is returned, so a caller cannot accidentally retain content. A value
 * that will not serialise measures 0 rather than throwing on the hook path.
 * @param value Anything a tool sent or returned.
 * @returns The UTF-8 byte length, or 0.
 */
export function byteLength(value: unknown): number {
  try {
    if (value === undefined || value === null) return 0
    const s = typeof value === 'string' ? value : JSON.stringify(value)
    return s === undefined ? 0 : Buffer.byteLength(s, 'utf8')
  } catch {
    return 0
  }
}

/** How Claude Code names an MCP tool. */
const MCP_TOOL = /^mcp__(.+)__([^_].*)$/

/**
 * Split a tool name into its server and tool.
 *
 * Claude Code presents an MCP tool as `mcp__<server>__<tool>`. Server names contain
 * underscores of their own, so the split is greedy on the server side: the last
 * `__` separates them. Anything that is not an MCP tool is a Claude Code built-in.
 * @param name The tool name from the hook payload.
 * @returns The server (null for a built-in), the tool, and whether it is built in.
 */
export function splitToolName(name: string): { server: string | null; tool: string; builtin: boolean } {
  const m = MCP_TOOL.exec(name)
  if (!m) return { server: null, tool: name, builtin: true }
  const [, server, tool] = m
  if (!server || !tool) return { server: null, tool: name, builtin: true }
  return { server, tool, builtin: false }
}

/**
 * The error codes Ariadne is willing to write down.
 *
 * A closed list, not a pattern. Matching an error code by its shape means any
 * secret shaped like a code gets written to the ledger, and a password of
 * `MY_SUPER_SECRET_PASS` is shaped exactly like a code. Membership cannot be
 * defeated that way. An unlisted code degrades to `error`, which loses detail and
 * leaks nothing, and that is the direction this project fails in by design.
 */
const KNOWN_ERROR_CODES = new Set([
  // MCP and JSON-RPC
  'CONNECTION_CLOSED', 'CONNECTION_REFUSED', 'CONNECTION_ERROR', 'TRANSPORT_ERROR',
  'PARSE_ERROR', 'INVALID_REQUEST', 'METHOD_NOT_FOUND', 'INVALID_PARAMS',
  'INTERNAL_ERROR', 'SERVER_ERROR', 'SERVER_NOT_INITIALIZED', 'REQUEST_TIMEOUT',
  'TIMEOUT', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED',
  'RATE_LIMIT_EXCEEDED',
  // errno
  'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOENT', 'EACCES', 'EPERM',
  'EADDRINUSE', 'EHOSTUNREACH', 'ENETUNREACH', 'EAGAIN', 'EMFILE', 'ENOMEM',
  'EISDIR', 'ENOTDIR', 'EEXIST', 'ENOSPC',
])

/** Enumerates candidate codes in text; never used to accept one, only to find one to check. */
const ERROR_CODE_CANDIDATE = /\b[A-Z][A-Z0-9_]{2,40}\b/g

/**
 * Reduce an error to a class, never its text.
 *
 * A tool's error output is the output of whatever it ran, and a failing `curl`,
 * `npm` or database driver prints connection strings, tokens and query text. None
 * of that may reach disk. A recognised code survives because it is a fixed
 * vocabulary; everything else collapses to one word. A non-string is treated as
 * absent rather than coerced, so a hostile object cannot reach the filesystem
 * through `toString`.
 * @param text The raw error text, if any.
 * @returns A code, the literal `error`, or null when nothing failed.
 */
export function errorClass(text: string | undefined): string | null {
  if (typeof text !== 'string' || text === '') return null
  const candidates = text.match(ERROR_CODE_CANDIDATE)
  if (!candidates) return 'error'
  for (const candidate of candidates) {
    if (KNOWN_ERROR_CODES.has(candidate)) return candidate
  }
  return 'error'
}
