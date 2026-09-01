import { describe, expect, it } from 'bun:test'
import { renderReport } from '../src/report'
import type { CallEvent, LedgerSlice, ProbeEvent } from '../src/findings'

const slice: LedgerSlice = {
  probes: [{
    v: 1, t: 'probe', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'probe',
    server: 'knossos', transport: 'stdio', ok: true, connect_ms: 405, tool_count: 2, defs_bytes: 41822,
    tools: [
      { name: 'scan', desc: 'scans', desc_bytes: 5, schema_bytes: 900, schema_hash: 'h1' },
      { name: 'list', desc: 'lists', desc_bytes: 5, schema_bytes: 900, schema_hash: 'h2' },
    ],
  }, {
    v: 1, t: 'probe', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'probe',
    server: 'claude.ai Gmail', transport: 'http', ok: false, connect_ms: null, tool_count: 0,
    defs_bytes: 0, tools: [], reason: 'oauth-unreachable',
  }],
  calls: [{
    v: 1, t: 'call', ts: '2026-09-01T10:00:01.000Z', session: 's1', project: 'p', source: 'hook',
    server: 'knossos', tool: 'scan', builtin: false, ms: 412, in_bytes: 50, out_bytes: 38213,
    ok: true, err: null, id: 'toolu_1',
  }, {
    v: 1, t: 'call', ts: '2026-09-01T10:00:02.000Z', session: 's1', project: 'p', source: 'hook',
    server: null, tool: 'Read', builtin: true, ms: 12, in_bytes: 40, out_bytes: 2100,
    ok: true, err: null, id: 'toolu_2',
  }],
  conns: [],
}

describe('renderReport', () => {
  const out = renderReport(slice)

  it('lists each server with its standing cost', () => {
    expect(out).toContain('knossos')
    expect(out).toContain('41,822')
  })

  it('marks an unmeasurable server as unmeasured rather than guessing', () => {
    expect(out).toContain('claude.ai Gmail')
    expect(out).toContain('unmeasured')
    expect(out).not.toMatch(/claude\.ai Gmail.*\d+ bytes/)
  })

  it('marks every token figure as an estimate', () => {
    expect(out).toContain('estimated')
  })

  it('separates built-ins into a baseline block', () => {
    expect(out).toContain('Baseline')
    expect(out).toContain('Read')
  })

  it('prints the findings under the table', () => {
    expect(out.indexOf('Findings')).toBeGreaterThan(out.indexOf('knossos'))
  })

  it('says so plainly when there is nothing to report', () => {
    expect(renderReport({ calls: [], probes: [], conns: [] })).toContain('No measurements yet')
  })

  it('prints every axis the readme promises', () => {
    for (const row of ['standing cost', 'reach', 'calls', 'errors', 'returned', 'largest', 'share', 'latency p50', 'latency p95']) {
      expect(out).toContain(row)
    }
  })

  it('prints a dash rather than a percentile below the sample floor', () => {
    expect(out).toContain('latency p95     -')
  })

  it('prints one row for a server the sources spell differently', () => {
    const mixed: LedgerSlice = {
      probes: [{ ...(slice.probes[0] as ProbeEvent), server: 'claude.ai Gmail' }],
      calls: [{ ...(slice.calls[0] as CallEvent), server: 'claude_ai_Gmail', tool: 'send' }],
      conns: [],
    }
    const out = renderReport(mixed)
    expect(out).toContain('claude.ai Gmail')
    expect(out).not.toContain('claude_ai_Gmail')
    expect(out.split('standing cost').length - 1).toBe(1)
  })
})
