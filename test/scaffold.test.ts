import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf8')

describe('plugin manifest', () => {
  it('names the plugin and its version', () => {
    const m = JSON.parse(read('.claude-plugin/plugin.json'))
    expect(m.name).toBe('ariadne')
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('agrees with package.json on the version', () => {
    const m = JSON.parse(read('.claude-plugin/plugin.json'))
    const p = JSON.parse(read('package.json'))
    expect(m.version).toBe(p.version)
  })
})

describe('hooks.json', () => {
  const hooks = JSON.parse(read('hooks/hooks.json')).hooks

  it('registers Pre and Post for every tool, MCP and built-in', () => {
    for (const event of ['PreToolUse', 'PostToolUse']) {
      const entry = hooks[event][0]
      expect(entry.matcher).toBe('.*')
      expect(entry.hooks[0].command).toContain('ariadne-hook')
      expect(entry.hooks[0].timeout).toBeLessThanOrEqual(2)
    }
  })

  it('registers SessionStart for the build ladder and the prober', () => {
    expect(hooks.SessionStart[0].hooks[0].command).toContain('session-start.sh')
  })

  it('registers no event that could speak to the model', () => {
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart'])
  })
})

describe('session-start.sh', () => {
  const sh = read('hooks/scripts/session-start.sh')

  it('always exits zero', () => {
    expect(sh).toContain('exit 0')
    expect(sh).not.toContain('exit 1')
  })

  it('drains stdin so the caller never blocks', () => {
    expect(sh).toContain('cat >/dev/null')
  })
})
