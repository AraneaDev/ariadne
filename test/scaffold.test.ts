import { describe, expect, it } from 'bun:test'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

  it('routes Pre and Post through the shim, not the binary directly', () => {
    // The binary is gitignored and built in the background on first install; a
    // command that invoked it directly would fail with exit 127 for the whole
    // first session, twice per tool call.
    for (const event of ['PreToolUse', 'PostToolUse']) {
      const command: string = hooks[event][0].hooks[0].command
      expect(command).toContain('ariadne-hook.sh')
      expect(command).not.toContain('bin/ariadne-hook')
    }
  })

  it('exits 0 silently when CLAUDE_PLUGIN_ROOT points at a directory without the scripts', async () => {
    // Cursor runs imported plugin hooks with another plugin's root in
    // CLAUDE_PLUGIN_ROOT. `sh` on a missing file exits 2, which a PreToolUse
    // hook reports as "block this tool call", so every tool call was refused.
    const elsewhere = mkdtempSync(join(tmpdir(), 'other-plugin-'))
    for (const event of ['SessionStart', 'PreToolUse', 'PostToolUse']) {
      const command: string = hooks[event][0].hooks[0].command
      const proc = Bun.spawn(['sh', '-c', command], {
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: elsewhere },
        stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
      })
      proc.stdin.write('{"hook_event_name":"' + event + '"}')
      await proc.stdin.end()
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
      ])
      expect({ event, code, out, err }).toEqual({ event, code: 0, out: '', err: '' })
    }
  })

  it('still runs the shim when CLAUDE_PLUGIN_ROOT is right', async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), 'ariadne-plugin-'))
    mkdirSync(join(pluginRoot, 'hooks', 'scripts'), { recursive: true })
    mkdirSync(join(pluginRoot, 'bin'), { recursive: true })
    copyFileSync(join(root, 'hooks/scripts/ariadne-hook.sh'), join(pluginRoot, 'hooks/scripts/ariadne-hook.sh'))
    writeFileSync(join(pluginRoot, 'bin', 'ariadne-hook'), '#!/bin/sh\ncat >/dev/null\necho ran\n')
    chmodSync(join(pluginRoot, 'bin', 'ariadne-hook'), 0o755)
    const proc = Bun.spawn(['sh', '-c', hooks.PreToolUse[0].hooks[0].command], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
    })
    proc.stdin.end()
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    expect(out.trim()).toBe('ran')
    expect(code).toBe(0)
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

  it('drains stdin before any early exit', () => {
    const drain = sh.indexOf('cat >/dev/null')
    const firstExit = sh.indexOf('exit 0')
    expect(drain).toBeGreaterThan(-1)
    expect(firstExit).toBeGreaterThan(-1)
    expect(drain).toBeLessThan(firstExit)
  })

  it('carries CLAUDE_PROJECT_DIR into the prober, so it measures the project rather than the plugin cache', () => {
    expect(sh).toContain('CLAUDE_PROJECT_DIR')
  })
})
