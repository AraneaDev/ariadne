import { describe, expect, it } from 'bun:test'
import { probeCwd, probeSessionId, unprobeableReason } from '../src/probe/run'

describe('probeCwd', () => {
  it('prefers CLAUDE_PROJECT_DIR over process.cwd()', () => {
    expect(probeCwd({ CLAUDE_PROJECT_DIR: '/root/my-project' })).toBe('/root/my-project')
  })

  it('falls back to process.cwd() when CLAUDE_PROJECT_DIR is absent', () => {
    expect(probeCwd({})).toBe(process.cwd())
  })

  it('falls back to process.cwd() when CLAUDE_PROJECT_DIR is empty', () => {
    expect(probeCwd({ CLAUDE_PROJECT_DIR: '' })).toBe(process.cwd())
  })
})

describe('probeSessionId', () => {
  it('prefers CLAUDE_CODE_SESSION_ID, not the CLAUDE_SESSION_ID Claude Code never sets', () => {
    expect(probeSessionId({ CLAUDE_CODE_SESSION_ID: 'abc123', CLAUDE_SESSION_ID: 'wrong' })).toBe('abc123')
  })

  it('falls back to a synthetic id when neither is set', () => {
    expect(probeSessionId({})).toMatch(/^probe-\d+$/)
  })
})

describe('unprobeableReason', () => {
  it('finds a stdio server probeable', () => {
    expect(unprobeableReason('stdio')).toBeNull()
  })

  it('labels an http server remote-unmeasured, not oauth-unreachable', () => {
    expect(unprobeableReason('http')).toBe('remote-unmeasured')
  })

  it('labels an sse server remote-unmeasured too', () => {
    expect(unprobeableReason('sse')).toBe('remote-unmeasured')
  })

  it('labels an unrecognised transport remote-unmeasured', () => {
    expect(unprobeableReason('other')).toBe('remote-unmeasured')
  })
})
