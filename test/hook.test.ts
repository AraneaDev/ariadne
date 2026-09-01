import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handle } from '../src/hook'
import { readCalls } from '../src/ledger'
import type { HookPayload } from '../src/types'

const base: HookPayload = {
  session_id: 's1',
  cwd: '/root/ariadne',
  tool_name: 'mcp__knossos__scan_project',
  tool_input: { path: '/root/ariadne' },
  tool_use_id: 'toolu_1',
}

beforeEach(() => {
  process.env.ARIADNE_HOME = mkdtempSync(join(tmpdir(), 'ariadne-'))
})

describe('handle', () => {
  it('never returns anything to the model', () => {
    expect(handle({ ...base, hook_event_name: 'PreToolUse' })).toBeNull()
    expect(handle({ ...base, hook_event_name: 'PostToolUse', tool_response: 'x' })).toBeNull()
  })

  it('records nothing on PreToolUse alone', () => {
    handle({ ...base, hook_event_name: 'PreToolUse' })
    expect(readCalls()).toEqual([])
  })

  it('records one call on PostToolUse', () => {
    handle({ ...base, hook_event_name: 'PreToolUse' })
    handle({ ...base, hook_event_name: 'PostToolUse', tool_response: { ok: true } })
    const calls = readCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.server).toBe('knossos')
    expect(calls[0]?.ok).toBe(true)
  })

  it('measures elapsed time from the Pre marker', async () => {
    handle({ ...base, hook_event_name: 'PreToolUse' })
    await Bun.sleep(15)
    handle({ ...base, hook_event_name: 'PostToolUse', tool_response: 'x' })
    expect(readCalls()[0]?.ms).toBeGreaterThanOrEqual(10)
  })

  it('records a call with null timing when the Pre marker is missing', () => {
    handle({ ...base, hook_event_name: 'PostToolUse', tool_response: 'x' })
    expect(readCalls()[0]?.ms).toBeNull()
  })

  it('records a built-in with no server', () => {
    handle({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_response: 'x' })
    const e = readCalls()[0]
    expect(e?.builtin).toBe(true)
    expect(e?.server).toBeNull()
  })

  it('records a failure as a failure', () => {
    handle({ ...base, hook_event_name: 'PostToolUse', error: 'CONNECTION_CLOSED: gone' })
    const e = readCalls()[0]
    expect(e?.ok).toBe(false)
    expect(e?.err).toBe('CONNECTION_CLOSED')
  })

  it('ignores an interrupted call', () => {
    handle({ ...base, hook_event_name: 'PostToolUse', is_interrupt: true, error: 'aborted' })
    expect(readCalls()).toEqual([])
  })

  it('ignores an unknown event', () => {
    handle({ ...base, hook_event_name: 'SessionEnd' })
    expect(readCalls()).toEqual([])
  })

  it('does not throw on a payload with nothing in it', () => {
    expect(() => handle({})).not.toThrow()
  })

  it('does not throw on a payload whose error field is not a string', () => {
    expect(() => handle({ ...base, hook_event_name: 'PostToolUse', error: 12345 as unknown as string })).not.toThrow()
  })

  it('does not throw on a payload that is not an object', () => {
    expect(() => handle(null as unknown as HookPayload)).not.toThrow()
    expect(() => handle(42 as unknown as HookPayload)).not.toThrow()
  })
})
