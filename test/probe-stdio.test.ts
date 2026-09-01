import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import { probeStdio, shapeTools } from '../src/probe/stdio'

const fake = join(import.meta.dir, 'fixtures', 'fake-server.ts')
const spec = (mode: string) => ({ command: process.execPath, args: ['run', fake, mode], env: {} })

describe('shapeTools', () => {
  it('measures each tool and the whole payload', () => {
    const { tools, defs_bytes } = shapeTools([
      { name: 'alpha', description: 'Does the alpha thing', inputSchema: { type: 'object' } },
    ])
    expect(tools).toHaveLength(1)
    expect(tools[0]?.name).toBe('alpha')
    expect(tools[0]?.desc).toBe('Does the alpha thing')
    expect(tools[0]?.desc_bytes).toBe(20)
    expect(tools[0]?.schema_bytes).toBeGreaterThan(0)
    expect(tools[0]?.schema_hash).toMatch(/^[0-9a-f]{16}$/)
    expect(defs_bytes).toBeGreaterThan(tools[0]!.schema_bytes)
  })

  it('gives identical schemas an identical hash regardless of key order', () => {
    const a = shapeTools([{ name: 'x', description: 'd', inputSchema: { a: 1, b: 2 } }])
    const b = shapeTools([{ name: 'y', description: 'd', inputSchema: { b: 2, a: 1 } }])
    const hashA = a.tools[0]?.schema_hash
    const hashB = b.tools[0]?.schema_hash
    expect(hashA).toBe(hashB)
  })

  it('returns nothing for a non-list', () => {
    expect(shapeTools('nope')).toEqual({ tools: [], defs_bytes: 0 })
  })
})

describe('probeStdio', () => {
  it('measures a server that answers', async () => {
    const r = await probeStdio(spec('ok'))
    expect(r.ok).toBe(true)
    expect(r.tool_count).toBe(2)
    expect(r.defs_bytes).toBeGreaterThan(0)
    expect(r.tools.map((t) => t.name)).toEqual(['alpha', 'beta'])
    expect(r.connect_ms).toBeGreaterThanOrEqual(0)
  })

  it('gives up on a server that never answers', async () => {
    const r = await probeStdio(spec('hang'), 300)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('timeout')
    expect(r.tools).toEqual([])
  })

  it('reports a handshake failure for a server that talks nonsense', async () => {
    const r = await probeStdio(spec('garbage'), 500)
    expect(r.ok).toBe(false)
    expect(['handshake-failed', 'timeout'] as Array<typeof r.reason>).toContain(r.reason)
  })

  it('reports a handshake failure for a server that dies', async () => {
    const r = await probeStdio(spec('crash'), 500)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('handshake-failed')
  })

  it('never leaves the child running', async () => {
    const r = await probeStdio(spec('hang'), 200)
    expect(r.ok).toBe(false)
  })
})
