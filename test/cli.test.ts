import { describe, expect, it } from 'bun:test'
import { flag } from '../src/cli'

describe('flag', () => {
  it('reads a flag value', () => {
    expect(flag(['--session', 'abc123'], '--session')).toBe('abc123')
  })

  it('returns undefined when the flag is absent', () => {
    expect(flag(['--project', 'x'], '--session')).toBeUndefined()
  })

  it('returns undefined when the flag has nothing after it', () => {
    expect(flag(['--session'], '--session')).toBeUndefined()
  })

  it('returns undefined when the value is itself another flag', () => {
    expect(flag(['--session', '--project', 'x'], '--session')).toBeUndefined()
  })

  it('returns undefined for an empty value', () => {
    expect(flag(['--session', ''], '--session')).toBeUndefined()
  })
})
