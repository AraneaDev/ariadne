import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { errorClass } from '../measure'
import type { Transport } from '../types'
import type { SpawnSpec } from './stdio'

/** One server as Claude Code reports it. Status only, never a command line. */
export interface RosterEntry {
  server: string
  transport: Transport
  connected: boolean
  err: string | null
}

/** `name: command - status`, where the name may contain colons of its own. */
const ROW = /^(.+?):\s+(.*?)\s+-\s+(.+)$/

/**
 * Classify a transport from the command column, then discard the column.
 *
 * The command is read and dropped inside this function. It is the one place a
 * secret can appear, because `claude mcp list` prints API keys in it verbatim, so
 * nothing derived from it beyond this three-value classification ever escapes.
 * @param command The command column.
 * @returns The transport kind.
 */
function transportOf(command: string): Transport {
  if (/^https?:\/\//.test(command)) return command.includes('/sse') ? 'sse' : 'http'
  if (command.trim() === '') return 'other'
  return 'stdio'
}

/**
 * Parse `claude mcp list` output into a roster.
 *
 * This is the only source that sees every scope at once: user, project, local,
 * plugin-provided and the claude.ai connectors. It is also the only source that
 * knows whether a server is connected right now.
 * @param stdout The raw output of `claude mcp list`.
 * @returns One entry per server, with no command strings anywhere in it.
 */
export function parseRoster(stdout: string): RosterEntry[] {
  const out: RosterEntry[] = []
  for (const line of stdout.split('\n')) {
    const m = ROW.exec(line.trim())
    if (!m) continue
    const [, server, command, status] = m
    if (!server || status === undefined) continue
    const connected = status.includes('✔')
    out.push({
      server,
      transport: transportOf(command ?? ''),
      connected,
      err: connected ? null : errorClass(status),
    })
  }
  return out
}

/**
 * Read a JSON file, or null when it is missing or unreadable.
 * @param path The file to read.
 * @returns The parsed object, or null.
 */
function readJson(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Turn a config entry into a spawn spec, or null when it is not a stdio server.
 * @param entry The `mcpServers[name]` value.
 * @returns How to start it, or null.
 */
function toSpec(entry: unknown): SpawnSpec | null {
  if (entry === null || typeof entry !== 'object') return null
  const e = entry as { command?: unknown; args?: unknown; env?: unknown }
  if (typeof e.command !== 'string' || e.command === '') return null
  const args = Array.isArray(e.args) ? e.args.filter((a): a is string => typeof a === 'string') : []
  const env: Record<string, string> = {}
  if (e.env !== null && typeof e.env === 'object') {
    for (const [k, v] of Object.entries(e.env as Record<string, unknown>)) {
      if (typeof v === 'string') env[k] = v
    }
  }
  return { command: e.command, args, env }
}

/**
 * The home directory, preferring `$HOME` so tests can redirect it.
 * @returns An absolute home directory path.
 */
function homeBase(): string {
  const h = process.env.HOME
  return h && isAbsolute(h) ? h : homedir()
}

/**
 * Find how to start one server, across the scopes Claude Code reads.
 *
 * Project scope wins over user scope, matching Claude Code's own precedence. A
 * server with no `command` is a remote, and there is nothing here to spawn: the
 * caller records it as unmeasured rather than guessing at its standing cost.
 *
 * The returned spec lives in memory for the length of one probe. It is never
 * written to the ledger, because it carries the API keys and connection strings
 * that make a server work.
 * @param server The server name.
 * @param cwd The project directory.
 * @returns How to start it, or null when it cannot be started from here.
 */
export function resolveSpawn(server: string, cwd: string): SpawnSpec | null {
  const projectConfig = readJson(join(cwd, '.mcp.json'))
  const projectServers = projectConfig?.mcpServers
  if (projectServers !== null && typeof projectServers === 'object') {
    const spec = toSpec((projectServers as Record<string, unknown>)[server])
    if (spec) return spec
  }

  const userConfig = readJson(join(homeBase(), '.claude.json'))
  const local = (userConfig?.projects as Record<string, { mcpServers?: unknown }> | undefined)?.[cwd]?.mcpServers
  if (local !== null && typeof local === 'object') {
    const spec = toSpec((local as Record<string, unknown>)[server])
    if (spec) return spec
  }

  const userServers = userConfig?.mcpServers
  if (userServers !== null && typeof userServers === 'object') {
    const spec = toSpec((userServers as Record<string, unknown>)[server])
    if (spec) return spec
  }

  return null
}
