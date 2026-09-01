import { describe, expect, it } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const shim = join(root, 'hooks', 'scripts', 'ariadne-hook.sh')

describe('the ariadne-hook shim', () => {
  it('exits 0 with no output when the binary has not been built yet', async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), 'ariadne-plugin-'))
    const proc = Bun.spawn(['sh', shim], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
    })
    proc.stdin.end()
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    expect(code).toBe(0)
    expect(out).toBe('')
  })

  it('exits 0 with no output when CLAUDE_PLUGIN_ROOT is not even set', async () => {
    const env = { ...process.env }
    delete env.CLAUDE_PLUGIN_ROOT
    const proc = Bun.spawn(['sh', shim], { env, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
    proc.stdin.end()
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    expect(code).toBe(0)
    expect(out).toBe('')
  })

  it('drains stdin so the caller never sees a broken pipe', async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), 'ariadne-plugin-'))
    const proc = Bun.spawn(['sh', shim], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
    })
    proc.stdin.write('x'.repeat(200_000))
    await proc.stdin.end()
    const code = await proc.exited
    expect(code).toBe(0)
  })

  it('execs the real binary once it exists', async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), 'ariadne-plugin-'))
    mkdirSync(join(pluginRoot, 'bin'), { recursive: true })
    const bin = join(pluginRoot, 'bin', 'ariadne-hook')
    writeFileSync(bin, '#!/bin/sh\ncat >/dev/null\necho ran\n')
    chmodSync(bin, 0o755)
    const proc = Bun.spawn(['sh', shim], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
    })
    proc.stdin.end()
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    expect(out.trim()).toBe('ran')
    expect(code).toBe(0)
  })
})
