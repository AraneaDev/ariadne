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
  const cut = server.lastIndexOf('__')
  if (cut === -1) return { server, tool, builtin: false }
  return { server: server.slice(0, cut), tool: `${server.slice(cut + 2)}__${tool}`, builtin: false }
}

/**
 * An error code as servers, transports and libc report them.
 *
 * Two shapes only: an errno name (`ECONNREFUSED`), or screaming snake case
 * (`CONNECTION_CLOSED`). Both are narrow enough that arbitrary error prose will not
 * match one, which is the point: the alternative is a wider pattern that
 * occasionally lifts a fragment of a token out of a failing request and writes it
 * to disk.
 *
 * Unanchored, because the code is rarely first. Claude Code reports
 * `Failed to connect - CONNECTION_CLOSED: ...` and its own logs report
 * `Connection failed: CONNECTION_CLOSED: ...`.
 */
const ERROR_CODE = /\b(E[A-Z]{3,15}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/

/**
 * Reduce an error to a class, never its text.
 *
 * A tool's error output is the output of whatever it ran, and a failing `curl`,
 * `npm` or database driver prints connection strings, tokens and query text. None
 * of that may reach disk. A recognised code survives because it is a fixed
 * vocabulary; everything else collapses to one word.
 * @param text The raw error text, if any.
 * @returns A code, the literal `error`, or null when nothing failed.
 */
export function errorClass(text: string | undefined): string | null {
  if (text === undefined || text === null || text === '') return null
  const m = ERROR_CODE.exec(text)
  return m?.[1] ?? 'error'
}
