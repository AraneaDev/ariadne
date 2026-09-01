import { describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dayFile, paths, projectSlug, safeSegment } from '../src/paths'

describe('safeSegment', () => {
  it('strips path separators', () => {
    expect(safeSegment('../../etc/passwd')).toBe('..-..-etc-passwd')
  })

  it('collapses dangerous segments to the fallback', () => {
    expect(safeSegment('..')).toBe('unknown')
    expect(safeSegment('.')).toBe('unknown')
    expect(safeSegment('')).toBe('unknown')
  })

  it('treats a non-string as absent', () => {
    expect(safeSegment(undefined as unknown as string)).toBe('unknown')
  })
})

describe('projectSlug', () => {
  it('is stable for one path and distinct across paths', () => {
    const a = projectSlug('/root/ariadne')
    expect(a).toBe(projectSlug('/root/ariadne'))
    expect(a).not.toBe(projectSlug('/root/cassandra'))
    expect(a).toMatch(/^[a-zA-Z0-9._-]+-[0-9a-f]{8}$/)
  })
})

describe('paths', () => {
  it('resolves every directory under the data root', () => {
    const home = mkdtempSync(join(tmpdir(), 'ariadne-'))
    process.env.ARIADNE_HOME = home
    const p = paths()
    expect(p.root).toBe(home)
    expect(p.calls).toBe(join(home, 'calls'))
    expect(p.probes).toBe(join(home, 'probes'))
    expect(p.conns).toBe(join(home, 'conns'))
    delete process.env.ARIADNE_HOME
  })
})

describe('dayFile', () => {
  it('names a file by UTC date', () => {
    expect(dayFile('/x', new Date('2026-09-01T23:30:00Z'))).toBe('/x/2026-09-01.jsonl')
  })
})
