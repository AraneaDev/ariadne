import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dataRoot, dayFile, paths, projectSlug, safeSegment } from '../src/paths'

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

  it('resolves a symlink to the same project as the real path it points at', () => {
    const real = mkdtempSync(join(tmpdir(), 'ariadne-repo-'))
    mkdirSync(join(real, '.git'))
    const link = join(tmpdir(), `ariadne-link-${process.pid}-${Date.now()}`)
    symlinkSync(real, link)
    try {
      expect(projectSlug(link)).toBe(projectSlug(real))
    } finally {
      rmSync(link, { force: true })
      rmSync(real, { recursive: true, force: true })
    }
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

describe('dataRoot', () => {
  const originalHome = process.env.HOME
  const originalPluginData = process.env.CLAUDE_PLUGIN_DATA

  it('never remembers an ARIADNE_HOME override in the real home directory', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'ariadne-fakehome-'))
    const dataDir = mkdtempSync(join(tmpdir(), 'ariadne-data-'))
    process.env.HOME = fakeHome
    delete process.env.CLAUDE_PLUGIN_DATA
    process.env.ARIADNE_HOME = dataDir
    try {
      expect(dataRoot()).toBe(dataDir)
      expect(existsSync(join(fakeHome, '.ariadne', 'data-root'))).toBe(false)
    } finally {
      delete process.env.ARIADNE_HOME
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
      if (originalPluginData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
      else process.env.CLAUDE_PLUGIN_DATA = originalPluginData
    }
  })

  it('still remembers CLAUDE_PLUGIN_DATA, which the hooks rely on for a bare CLI call', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'ariadne-fakehome-'))
    const dataDir = mkdtempSync(join(tmpdir(), 'ariadne-plugindata-'))
    process.env.HOME = fakeHome
    delete process.env.ARIADNE_HOME
    process.env.CLAUDE_PLUGIN_DATA = dataDir
    try {
      expect(dataRoot()).toBe(dataDir)
      expect(existsSync(join(fakeHome, '.ariadne', 'data-root'))).toBe(true)
    } finally {
      delete process.env.CLAUDE_PLUGIN_DATA
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
      if (originalPluginData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
      else process.env.CLAUDE_PLUGIN_DATA = originalPluginData
    }
  })
})

describe('dayFile', () => {
  it('names a file by UTC date', () => {
    expect(dayFile('/x', new Date('2026-09-01T23:30:00Z'))).toBe('/x/2026-09-01.jsonl')
  })
})
