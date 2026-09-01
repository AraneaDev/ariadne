import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderReport, sliceFor } from '../src/report'
import { appendCall } from '../src/ledger'
import type { CallEvent, LedgerSlice, ProbeEvent } from '../src/findings'

const slice: LedgerSlice = {
  probes: [{
    v: 1, t: 'probe', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'probe',
    server: 'knossos', transport: 'stdio', ok: true, connect_ms: 405, tool_count: 2, defs_bytes: 41822,
    tools: [
      { name: 'scan', desc_bytes: 5, schema_bytes: 900, schema_hash: 'h1' },
      { name: 'list', desc_bytes: 5, schema_bytes: 900, schema_hash: 'h2' },
    ],
  }, {
    v: 1, t: 'probe', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'probe',
    server: 'claude.ai Gmail', transport: 'http', ok: false, connect_ms: null, tool_count: 0,
    defs_bytes: 0, tools: [], reason: 'remote-unmeasured',
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
    for (const row of ['standing cost', 'reach', 'calls', 'returned', 'largest', 'share', 'latency p50', 'latency p95']) {
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

  it('labels the share row against MCP bytes only, not the whole session', () => {
    expect(out).toContain('of MCP bytes returned')
  })

  it('prints no per-call error rate, which the hook payload cannot support', () => {
    expect(out).not.toContain('errors')
  })
})

describe('sliceFor', () => {
  beforeEach(() => {
    process.env.ARIADNE_HOME = mkdtempSync(join(tmpdir(), 'ariadne-'))
  })

  it('with session undefined returns everything, unlike an empty-string session', () => {
    const call: CallEvent = {
      v: 1, t: 'call', ts: '2026-09-01T10:00:00.000Z', session: 'abc123', project: 'p', source: 'hook',
      server: 'knossos', tool: 'scan', builtin: false, ms: 100, in_bytes: 10, out_bytes: 20,
      ok: true, err: null, id: 'toolu_1',
    }
    appendCall(call)
    expect(sliceFor({ session: undefined }).calls).toHaveLength(1)
    expect(sliceFor({ session: '' }).calls).toHaveLength(0)
    expect(sliceFor({ session: 'abc123' }).calls).toHaveLength(1)
  })
})

describe('percentiles in the per-server table', () => {
  const probeFor = (): ProbeEvent => ({
    v: 1, t: 'probe', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'probe',
    server: 'x', transport: 'stdio', ok: true, connect_ms: 10, tool_count: 1, defs_bytes: 100,
    tools: [{ name: 'go', desc_bytes: 5, schema_bytes: 10, schema_hash: 'h' }],
  })
  const callWithMs = (ms: number, i: number): CallEvent => ({
    v: 1, t: 'call', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'hook',
    server: 'x', tool: 'go', builtin: false, ms, in_bytes: 1, out_bytes: 1,
    ok: true, err: null, id: `c${i}`,
  })

  it('uses nearest-rank for p50, index 2 of 6 rather than index 3', () => {
    // Sorted latencies 10,20,30,40,50,60: nearest-rank p50 is index 2 (30ms),
    // not the old Math.floor(6/2)=3 (40ms).
    const calls = [10, 20, 30, 40, 50, 60].map((ms, i) => callWithMs(ms, i))
    const out = renderReport({ probes: [probeFor()], calls, conns: [] })
    expect(out).toContain('latency p50     30ms')
  })

  it('uses nearest-rank for p95, never returning the maximum at n = 20', () => {
    const calls = Array.from({ length: 20 }, (_, i) => callWithMs((i + 1) * 10, i))
    const out = renderReport({ probes: [probeFor()], calls, conns: [] })
    // Sorted latencies 10..200. Nearest-rank p95 of 20 values is index 18 -> 190ms,
    // not the maximum (200ms) the old Math.floor(len*0.95) formula gave.
    expect(out).toContain('latency p95     190ms')
    expect(out).not.toContain('latency p95     200ms')
  })
})

describe('the baseline block', () => {
  it('prints the real median, not the mean', () => {
    const builtins: CallEvent[] = [1, 2, 3, 4, 100].map((out_bytes, i) => ({
      v: 1, t: 'call', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'hook',
      server: null, tool: 'Read', builtin: true, ms: 5, in_bytes: 1, out_bytes,
      ok: true, err: null, id: `b${i}`,
    }))
    const out = renderReport({ probes: [], calls: builtins, conns: [] })
    // Mean of 1,2,3,4,100 is 22; nearest-rank median is 3.
    expect(out).toContain('3 bytes median')
    expect(out).not.toContain('22 bytes median')
  })
})
