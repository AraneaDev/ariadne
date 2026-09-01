import { beforeEach, describe, expect, it } from 'bun:test'
import { chmodSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendCall, appendConn, readCalls, readConns, readProbes, writeProbes } from '../src/ledger'
import type { CallEvent, ConnEvent, ProbeEvent } from '../src/types'

const call: CallEvent = {
  v: 1, t: 'call', ts: '2026-09-01T12:00:00.000Z', session: 's1',
  project: 'ariadne-aaaaaaaa', source: 'hook',
  server: 'knossos', tool: 'scan_project', builtin: false,
  ms: 412, in_bytes: 180, out_bytes: 38213, ok: true, err: null, id: 'toolu_1',
}

beforeEach(() => {
  process.env.ARIADNE_HOME = mkdtempSync(join(tmpdir(), 'ariadne-'))
})

describe('appendCall', () => {
  it('round-trips one event', () => {
    appendCall(call)
    expect(readCalls()).toEqual([call])
  })

  it('appends rather than overwrites', () => {
    appendCall(call)
    appendCall({ ...call, id: 'toolu_2' })
    expect(readCalls().map((e) => e.id)).toEqual(['toolu_1', 'toolu_2'])
  })

  it('never throws when the ledger is unwritable', () => {
    const root = process.env.ARIADNE_HOME as string
    chmodSync(root, 0o500)
    expect(() => appendCall(call)).not.toThrow()
    chmodSync(root, 0o700)
  })
})

describe('readCalls', () => {
  it('returns nothing when no ledger exists', () => {
    expect(readCalls()).toEqual([])
  })

  it('skips a corrupt line rather than failing the read', async () => {
    appendCall(call)
    const file = join(process.env.ARIADNE_HOME as string, 'calls', '2026-09-01.jsonl')
    await Bun.write(file, `${JSON.stringify(call)}\nnot json at all\n`)
    expect(readCalls()).toHaveLength(1)
  })
})

describe('writeProbes', () => {
  it('writes to a per-session file and reads back', () => {
    const probe: ProbeEvent = {
      v: 1, t: 'probe', ts: '2026-09-01T12:00:00.000Z', session: 's1',
      project: 'ariadne-aaaaaaaa', source: 'probe',
      server: 'knossos', transport: 'stdio', ok: true, connect_ms: 405,
      tool_count: 1, defs_bytes: 1117,
      tools: [{ name: 'scan_project', desc: 'Scan a project', desc_bytes: 14, schema_bytes: 903, schema_hash: 'a1b2c3d4e5f60718' }],
    }
    writeProbes('s1', [probe])
    expect(readProbes()).toEqual([probe])
  })

  it('sanitises a hostile session id into a child path', () => {
    expect(() => writeProbes('../escape', [])).not.toThrow()
    expect(readProbes()).toEqual([])
  })
})

describe('appendConn', () => {
  it('round-trips a failed connection', () => {
    const conn: ConnEvent = {
      v: 1, t: 'conn', ts: '2026-09-01T12:00:00.000Z', session: 's1',
      project: 'ariadne-aaaaaaaa', source: 'cc-log',
      server: 'argos', transport: 'stdio', ok: false, err: 'CONNECTION_CLOSED',
    }
    appendConn(conn)
    expect(readConns()).toEqual([conn])
  })
})
