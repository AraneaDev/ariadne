import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfill, parseCcLogLine } from '../src/backfill'
import { readConns } from '../src/ledger'

const ok = JSON.stringify({
  debug: 'Successfully connected (transport: stdio) in 405ms',
  timestamp: '2026-08-09T20:23:36.236Z',
  sessionId: 'a7268ad7',
  cwd: '/root/sql-ts',
})

const failed = JSON.stringify({
  error: 'Connection failed: CONNECTION_CLOSED: Connection closed',
  timestamp: '2026-08-25T14:37:16.152Z',
  sessionId: 'b1234567',
  cwd: '/root/yielder',
})

describe('parseCcLogLine', () => {
  it('reads a successful connection', () => {
    const e = parseCcLogLine(ok, 'context7', 'p')
    expect(e?.ok).toBe(true)
    expect(e?.transport).toBe('stdio')
    expect(e?.ts).toBe('2026-08-09T20:23:36.236Z')
    expect(e?.source).toBe('cc-log')
  })

  it('reads a failure as an error class', () => {
    const e = parseCcLogLine(failed, 'argos', 'p')
    expect(e?.ok).toBe(false)
    expect(e?.err).toBe('CONNECTION_CLOSED')
  })

  it('ignores a line that is not about connecting', () => {
    expect(parseCcLogLine(JSON.stringify({ debug: 'Calling MCP tool: sql', timestamp: 't' }), 's', 'p')).toBeNull()
  })

  it('ignores a line that is not JSON', () => {
    expect(parseCcLogLine('half a line{', 's', 'p')).toBeNull()
  })
})

describe('backfill', () => {
  let cache: string

  beforeEach(() => {
    process.env.ARIADNE_HOME = mkdtempSync(join(tmpdir(), 'ariadne-'))
    cache = mkdtempSync(join(tmpdir(), 'cc-cache-'))
    process.env.ARIADNE_CC_LOGS = cache
  })

  it('reports nothing when the log directory does not exist', () => {
    process.env.ARIADNE_CC_LOGS = join(cache, 'nope')
    expect(backfill()).toEqual({ added: 0, scanned: 0 })
  })

  it('imports connection events from every project and server', () => {
    const dir = join(cache, '-root-sql-ts', 'mcp-logs-argos')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '2026-08-25T14-37-16-152Z.jsonl'), `${ok}\n${failed}\n`)
    expect(backfill().added).toBe(2)
    expect(readConns().map((e) => e.server)).toEqual(['argos', 'argos'])
  })

  it('is idempotent, so running it twice imports nothing new', () => {
    const dir = join(cache, '-root-sql-ts', 'mcp-logs-argos')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.jsonl'), `${ok}\n`)
    backfill()
    expect(backfill().added).toBe(0)
    expect(readConns()).toHaveLength(1)
  })

  it('survives a corrupt log file without losing the good ones', () => {
    const a = join(cache, '-root-a', 'mcp-logs-x')
    const b = join(cache, '-root-b', 'mcp-logs-y')
    mkdirSync(a, { recursive: true })
    mkdirSync(b, { recursive: true })
    writeFileSync(join(a, 'a.jsonl'), 'garbage\n{"broken":\n')
    writeFileSync(join(b, 'b.jsonl'), `${ok}\n`)
    expect(backfill().added).toBe(1)
  })
})
