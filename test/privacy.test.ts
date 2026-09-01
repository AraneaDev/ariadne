import { describe, expect, it } from 'bun:test'
import { byteLength, errorClass, splitToolName } from '../src/measure'
import { callEventFrom } from '../src/events'
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
