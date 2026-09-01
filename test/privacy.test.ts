import { beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { byteLength, errorClass, splitToolName } from '../src/measure'
import { callEventFrom } from '../src/events'
import { appendCall, appendConn, writeProbes } from '../src/ledger'
import { paths } from '../src/paths'
import { parseRoster } from '../src/probe/roster'
import { probeStdio } from '../src/probe/stdio'
import type { HookPayload } from '../src/types'

const SECRET = 'ctx7sk-13a43143-43d8-4026-a16a-ce7a1bc7c027'

describe('splitToolName', () => {
  it('splits an MCP tool into server and tool', () => {
    expect(splitToolName('mcp__knossos__scan_project'))
      .toEqual({ server: 'knossos', tool: 'scan_project', builtin: false })
  })

  it('keeps underscores inside a tool name', () => {
    expect(splitToolName('mcp__plugin_context-mode_context-mode__ctx_batch_execute'))
      .toEqual({ server: 'plugin_context-mode_context-mode', tool: 'ctx_batch_execute', builtin: false })
  })

  it('treats anything else as a built-in', () => {
    expect(splitToolName('Read')).toEqual({ server: null, tool: 'Read', builtin: true })
  })

  it('does not crash on a malformed prefix', () => {
    expect(splitToolName('mcp__')).toEqual({ server: null, tool: 'mcp__', builtin: true })
  })

  it('treats the rightmost double underscore as the separator', () => {
    expect(splitToolName('mcp__a__b__c')).toEqual({ server: 'a__b', tool: 'c', builtin: false })
  })
})

describe('byteLength', () => {
  it('measures the serialised form', () => {
    expect(byteLength({ a: 1 })).toBe(7)
  })

  it('counts multibyte characters as bytes, not code points', () => {
    // A string is measured as it stands, not re-serialised, so there are no added quotes.
    expect(byteLength('é')).toBe(2)
  })

  it('returns 0 for something unserialisable rather than throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(byteLength(cyclic)).toBe(0)
  })
})

describe('errorClass', () => {
  it('extracts a bare error code', () => {
    expect(errorClass('CONNECTION_CLOSED: Connection closed')).toBe('CONNECTION_CLOSED')
  })

  it('finds a code that is not at the start', () => {
    expect(errorClass('Connection failed: CONNECTION_CLOSED: Connection closed')).toBe('CONNECTION_CLOSED')
    expect(errorClass('spawn failed with ECONNREFUSED')).toBe('ECONNREFUSED')
  })

  it('falls back to a fixed label rather than free text', () => {
    expect(errorClass(`failed while using ${SECRET}`)).toBe('error')
  })

  it('is null when there is no error', () => {
    expect(errorClass(undefined)).toBeNull()
  })

  it('does not write a credential that happens to look like a code', () => {
    expect(errorClass('connection string postgres://user:MY_SUPER_SECRET_PASS@host/db failed')).toBe('error')
    expect(errorClass('token PGPASSWORD=SUPER_SECRET_VALUE_1234 invalid')).toBe('error')
    expect(errorClass('Missing required env var AWS_SECRET_ACCESS_KEY, aborting')).toBe('error')
  })

  it('still recognises a listed code anywhere in the text', () => {
    expect(errorClass('Connection failed: CONNECTION_CLOSED: Connection closed')).toBe('CONNECTION_CLOSED')
    expect(errorClass('spawn failed with ECONNREFUSED')).toBe('ECONNREFUSED')
  })

  it('treats a non-string as absent rather than coercing it', () => {
    expect(errorClass(12345 as unknown as string)).toBeNull()
    expect(errorClass({ toString: () => 'CONNECTION_CLOSED' } as unknown as string)).toBeNull()
  })
})

describe('callEventFrom', () => {
  const payload: HookPayload = {
    hook_event_name: 'PostToolUse',
    session_id: 's1',
    cwd: '/root/ariadne',
    tool_name: 'mcp__context7__query-docs',
    tool_input: { apiKey: SECRET, question: 'how do I use this' },
    tool_response: { content: `secret in the result too: ${SECRET}` },
    tool_use_id: 'toolu_1',
  }

  it('measures sizes and keeps no content at all', () => {
    const e = callEventFrom(payload, 412)
    expect(e).not.toBeNull()
    const serialised = JSON.stringify(e)
    expect(serialised).not.toContain(SECRET)
    expect(serialised).not.toContain('how do I use this')
    expect(serialised).not.toContain('secret in the result too')
  })

  it('records the measurements it is supposed to record', () => {
    const e = callEventFrom(payload, 412)
    expect(e?.server).toBe('context7')
    expect(e?.tool).toBe('query-docs')
    expect(e?.builtin).toBe(false)
    expect(e?.ms).toBe(412)
    expect(e?.in_bytes).toBeGreaterThan(0)
    expect(e?.out_bytes).toBeGreaterThan(0)
    expect(e?.ok).toBe(true)
  })

  it('marks a failure with a class and never its text', () => {
    const e = callEventFrom({ ...payload, error: `boom ${SECRET}` }, null)
    expect(e?.ok).toBe(false)
    expect(e?.err).toBe('error')
    expect(JSON.stringify(e)).not.toContain(SECRET)
  })

  it('refuses a payload with no tool name', () => {
    expect(callEventFrom({ ...payload, tool_name: undefined }, 1)).toBeNull()
  })
})

describe('privacy end to end: the ledger written to disk', () => {
  const LEDGER_SECRET = 'ctx7sk-e2e-a1b2c3d4-9f8e-7d6c-5b4a-3c2d1e0f9a8b'

  beforeEach(() => {
    process.env.ARIADNE_HOME = mkdtempSync(join(tmpdir(), 'ariadne-'))
  })

  /**
   * Every byte written under the data root, across every ledger file.
   * @returns The concatenated raw file contents.
   */
  function rawLedgerBytes(): string {
    let out = ''
    for (const dir of [paths().calls, paths().conns, paths().probes]) {
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir)) out += readFileSync(join(dir, name), 'utf8')
    }
    return out
  }

  it('never writes a planted secret to disk, through the call, probe or conn writer', async () => {
    // The hook path: a secret in the tool's arguments, its result and its error text.
    const call = callEventFrom({
      hook_event_name: 'PostToolUse',
      session_id: 'e2e-session',
      cwd: '/root/ariadne',
      tool_name: 'mcp__leaky__do_thing',
      tool_input: { token: LEDGER_SECRET },
      tool_response: { body: `here is your result, secretly: ${LEDGER_SECRET}` },
      tool_use_id: 'toolu_e2e',
      error: `boom ${LEDGER_SECRET}`,
    }, 42)
    expect(call).not.toBeNull()
    if (call) appendCall(call)

    // The backfill/probe path: a secret in the command column `claude mcp list`
    // prints, parsed by the real roster parser before it ever reaches a ConnEvent.
    const rosterLine = `argos: node /root/sql-ts/index.js --token=${LEDGER_SECRET} - ✘ Failed to connect — CONNECTION_CLOSED: ${LEDGER_SECRET}`
    const [entry] = parseRoster(rosterLine)
    expect(entry).toBeDefined()
    appendConn({
      v: 1, t: 'conn', ts: new Date().toISOString(), session: 'e2e-session', project: 'p', source: 'probe',
      server: entry!.server, transport: entry!.transport, ok: entry!.connected, err: entry!.err,
    })

    // The probe path: a secret in the spawned server's own environment and argv,
    // which the fake server writes into its tool description and schema default,
    // the one place a real hostile server could try to smuggle out its own config.
    const fake = join(import.meta.dir, 'fixtures', 'fake-server.ts')
    const probed = await probeStdio({
      command: process.execPath,
      args: ['run', fake, 'secret', `--token=${LEDGER_SECRET}`],
      env: { PLANTED_SECRET: LEDGER_SECRET },
    })
    expect(probed.ok).toBe(true)
    expect(probed.tools.length).toBeGreaterThan(0)
    writeProbes('e2e-session', [{
      v: 1, t: 'probe', ts: new Date().toISOString(), session: 'e2e-session', project: 'p', source: 'probe',
      server: 'leaky', transport: 'stdio', ok: probed.ok, connect_ms: probed.connect_ms,
      tool_count: probed.tool_count, defs_bytes: probed.defs_bytes, tools: probed.tools,
    }])

    const onDisk = rawLedgerBytes()
    expect(onDisk.length).toBeGreaterThan(0)
    expect(onDisk).not.toContain(LEDGER_SECRET)
  })
})
