import { describe, expect, it } from 'bun:test'
import { estimateTokens, findings } from '../src/findings'
import type { CallEvent, ConnEvent, LedgerSlice, ProbeEvent } from '../src/findings'

const probe = (server: string, tools: { name: string; desc?: string; hash?: string }[], defs = 5000): ProbeEvent => ({
  v: 1, t: 'probe', ts: '2026-09-01T10:00:00.000Z', session: 's1', project: 'p', source: 'probe',
  server, transport: 'stdio', ok: true, connect_ms: 100,
  tool_count: tools.length, defs_bytes: defs,
  tools: tools.map((t) => ({
    name: t.name, desc: t.desc ?? 'does a thing', desc_bytes: (t.desc ?? 'does a thing').length,
    schema_bytes: 100, schema_hash: t.hash ?? `hash-${t.name}`,
  })),
})

const call = (server: string, tool: string, out = 500, session = 's1'): CallEvent => ({
  v: 1, t: 'call', ts: '2026-09-01T10:00:01.000Z', session, project: 'p', source: 'hook',
  server, tool, builtin: false, ms: 100, in_bytes: 50, out_bytes: out, ok: true, err: null, id: `${server}-${tool}-${Math.random()}`,
})

const conn = (server: string, ok: boolean, ts: string, session: string): ConnEvent => ({
  v: 1, t: 'conn', ts, session, project: 'p', source: 'cc-log',
  server, transport: 'stdio', ok, err: ok ? null : 'CONNECTION_CLOSED',
})

const slice = (over: Partial<LedgerSlice>): LedgerSlice => ({ calls: [], probes: [], conns: [], ...over })

describe('estimateTokens', () => {
  it('derives a token estimate from bytes', () => {
    expect(estimateTokens(4000)).toBeGreaterThan(0)
    expect(estimateTokens(8000)).toBe(estimateTokens(4000) * 2)
  })
})

describe('paid for, never used', () => {
  it('fires for a probed server with no calls', () => {
    const f = findings(slice({ probes: [probe('idle', [{ name: 'a' }])] }))
    expect(f.map((x) => x.id)).toContain('paid-for-never-used')
  })

  it('stays silent when the server was called', () => {
    const f = findings(slice({ probes: [probe('used', [{ name: 'a' }])], calls: [call('used', 'a')] }))
    expect(f.map((x) => x.id)).not.toContain('paid-for-never-used')
  })

  it('names the standing cost in its evidence', () => {
    const f = findings(slice({ probes: [probe('idle', [{ name: 'a' }], 12345)] }))
    expect(f.find((x) => x.id === 'paid-for-never-used')?.evidence.join(' ')).toContain('12,345 bytes')
  })

  it('treats one server spelled three ways as one server', () => {
    const probes = [probe('claude.ai Gmail', [{ name: 'send' }])]
    const calls = [{ ...call('claude_ai_Gmail', 'send') }]
    expect(findings(slice({ probes, calls })).map((x) => x.id)).not.toContain('paid-for-never-used')
  })
})

describe('larger than advertised', () => {
  const p = probe('big', [{ name: 'list', desc: 'lists containers' }])

  it('stays silent below the minimum sample', () => {
    const calls = Array.from({ length: 4 }, () => call('big', 'list', 40000))
    expect(findings(slice({ probes: [p], calls })).map((x) => x.id)).not.toContain('larger-than-advertised')
  })

  it('fires at the minimum sample', () => {
    const calls = Array.from({ length: 5 }, () => call('big', 'list', 40000))
    expect(findings(slice({ probes: [p], calls })).map((x) => x.id)).toContain('larger-than-advertised')
  })

  it('stays silent for a tool whose results match its description', () => {
    const calls = Array.from({ length: 10 }, () => call('big', 'list', 60))
    expect(findings(slice({ probes: [p], calls })).map((x) => x.id)).not.toContain('larger-than-advertised')
  })
})

describe('configured, absent', () => {
  it('stays silent for a single failed session', () => {
    const conns = [conn('argos', false, '2026-08-25T10:00:00.000Z', 's1')]
    expect(findings(slice({ conns })).map((x) => x.id)).not.toContain('configured-absent')
  })

  it('fires across two sessions on two days', () => {
    const conns = [
      conn('argos', false, '2026-08-25T10:00:00.000Z', 's1'),
      conn('argos', false, '2026-08-27T10:00:00.000Z', 's2'),
    ]
    expect(findings(slice({ conns })).map((x) => x.id)).toContain('configured-absent')
  })

  it('stays silent when the server has connected since', () => {
    const conns = [
      conn('argos', false, '2026-08-25T10:00:00.000Z', 's1'),
      conn('argos', false, '2026-08-27T10:00:00.000Z', 's2'),
      conn('argos', true, '2026-08-28T10:00:00.000Z', 's3'),
    ]
    expect(findings(slice({ conns })).map((x) => x.id)).not.toContain('configured-absent')
  })

  it('marks that it rests on the logs Claude Code keeps', () => {
    const conns = [
      conn('argos', false, '2026-08-25T10:00:00.000Z', 's1'),
      conn('argos', false, '2026-08-27T10:00:00.000Z', 's2'),
    ]
    expect(findings(slice({ conns })).find((x) => x.id === 'configured-absent')?.derivedFrom).toContain('cc-log')
  })

  it('matches a connection logged under a different spelling', () => {
    const probes = [probe('claude.ai Gmail', [{ name: 'send' }])]
    const conns = [
      conn('claude-ai-Gmail', false, '2026-08-25T10:00:00.000Z', 's1'),
      conn('claude-ai-Gmail', false, '2026-08-27T10:00:00.000Z', 's2'),
    ]
    const f = findings(slice({ probes, conns }))
    expect(f.map((x) => x.id)).toContain('configured-absent')
    expect(f.find((x) => x.id === 'configured-absent')?.title).toContain('claude')
  })

  it('does not call a server absent when it is no longer configured at all', () => {
    const probes = [probe('present', [{ name: 'a' }])]
    const conns = [
      conn('removed-long-ago', false, '2026-04-01T10:00:00.000Z', 's1'),
      conn('removed-long-ago', false, '2026-04-03T10:00:00.000Z', 's2'),
    ]
    expect(findings(slice({ probes, conns })).map((x) => x.id)).not.toContain('configured-absent')
  })

  it('still reports absent servers when no probe has run yet', () => {
    const conns = [
      conn('argos', false, '2026-08-25T10:00:00.000Z', 's1'),
      conn('argos', false, '2026-08-27T10:00:00.000Z', 's2'),
    ]
    expect(findings(slice({ conns })).map((x) => x.id)).toContain('configured-absent')
  })
})

describe('twice over', () => {
  it('fires on an identical schema hash across servers', () => {
    const probes = [
      probe('a', [{ name: 'read_file', hash: 'same' }]),
      probe('b', [{ name: 'fetch_doc', hash: 'same' }]),
    ]
    expect(findings(slice({ probes })).map((x) => x.id)).toContain('twice-over')
  })

  it('fires on a normalised name match across servers', () => {
    const probes = [
      probe('a', [{ name: 'list_containers' }]),
      probe('b', [{ name: 'docker_list_containers' }]),
    ]
    expect(findings(slice({ probes })).map((x) => x.id)).toContain('twice-over')
  })

  it('stays silent for one server exposing two similar tools', () => {
    const probes = [probe('a', [{ name: 'list_containers' }, { name: 'docker_list_containers' }])]
    expect(findings(slice({ probes })).map((x) => x.id)).not.toContain('twice-over')
  })

  it('says what it cannot catch', () => {
    const probes = [probe('a', [{ name: 'x', hash: 'same' }]), probe('b', [{ name: 'y', hash: 'same' }])]
    expect(findings(slice({ probes })).find((f) => f.id === 'twice-over')?.evidence.join(' '))
      .toContain('name and schema')
  })
})

describe('low reach', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `t${i}` }))

  it('fires for a wide server used for two tools across three sessions', () => {
    const calls = ['s1', 's2', 's3'].flatMap((s) => [call('wide', 't0', 500, s), call('wide', 't1', 500, s)])
    expect(findings(slice({ probes: [probe('wide', many)], calls })).map((x) => x.id)).toContain('low-reach')
  })

  it('stays silent below three sessions', () => {
    const calls = ['s1', 's2'].flatMap((s) => [call('wide', 't0', 500, s)])
    expect(findings(slice({ probes: [probe('wide', many)], calls })).map((x) => x.id)).not.toContain('low-reach')
  })

  it('stays silent for a narrow server', () => {
    const calls = ['s1', 's2', 's3'].map((s) => call('narrow', 't0', 500, s))
    expect(findings(slice({ probes: [probe('narrow', [{ name: 't0' }])], calls })).map((x) => x.id)).not.toContain('low-reach')
  })
})

describe('built-ins', () => {
  it('never produce a finding', () => {
    const builtin: CallEvent = { ...call('x', 'Read'), server: null, builtin: true }
    expect(findings(slice({ calls: [builtin] }))).toEqual([])
  })
})
