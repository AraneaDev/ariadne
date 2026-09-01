import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRoster, resolveSpawn } from '../src/probe/roster'

const SECRET = 'ctx7sk-13a43143-43d8-4026-a16a-ce7a1bc7c027'

const sample = `Checking MCP server health…

claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - ✔ Connected
plugin:playwright:playwright: npx @playwright/mcp@latest - ✔ Connected
context7: npx -y @upstash/context7-mcp --api-key ${SECRET} - ✔ Connected
argos: node /root/sql-ts/dist/index.js - ✘ Failed to connect — CONNECTION_CLOSED: Connection closed
`

describe('parseRoster', () => {
  it('finds every server and its status', () => {
    const r = parseRoster(sample)
    expect(r.map((e) => e.server)).toEqual([
      'claude.ai Gmail', 'plugin:playwright:playwright', 'context7', 'argos',
    ])
    expect(r[0]?.connected).toBe(true)
    expect(r[3]?.connected).toBe(false)
  })

  it('classifies the transport from the command column', () => {
    const r = parseRoster(sample)
    expect(r[0]?.transport).toBe('http')
    expect(r[1]?.transport).toBe('stdio')
  })

  it('keeps an error class and never the error text', () => {
    expect(parseRoster(sample)[3]?.err).toBe('CONNECTION_CLOSED')
  })

  it('never carries a command string out of the parser', () => {
    expect(JSON.stringify(parseRoster(sample))).not.toContain(SECRET)
    expect(JSON.stringify(parseRoster(sample))).not.toContain('npx')
  })

  it('ignores the header and blank lines', () => {
    expect(parseRoster('Checking MCP server health…\n\n')).toEqual([])
  })
})

describe('resolveSpawn', () => {
  let home: string
  let project: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ariadne-home-'))
    project = mkdtempSync(join(tmpdir(), 'ariadne-proj-'))
    process.env.HOME = home
  })

  it('resolves a user-scope stdio server', () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({
      mcpServers: { knossos: { command: '/bin/knossos', args: ['--serve'], env: { K: '1' } } },
    }))
    expect(resolveSpawn('knossos', project)).toEqual({ command: '/bin/knossos', args: ['--serve'], env: { K: '1' } })
  })

  it('resolves a project-scope server from .mcp.json', () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: {} }))
    writeFileSync(join(project, '.mcp.json'), JSON.stringify({
      mcpServers: { local: { command: '/bin/local' } },
    }))
    expect(resolveSpawn('local', project)).toEqual({ command: '/bin/local', args: [], env: {} })
  })

  it('prefers the project scope over the user scope', () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({
      mcpServers: { dup: { command: '/bin/user' } },
    }))
    writeFileSync(join(project, '.mcp.json'), JSON.stringify({
      mcpServers: { dup: { command: '/bin/project' } },
    }))
    expect(resolveSpawn('dup', project)?.command).toBe('/bin/project')
  })

  it('returns null for a server with no command', () => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({
      mcpServers: { remote: { type: 'http', url: 'https://example.test/mcp' } },
    }))
    expect(resolveSpawn('remote', project)).toBeNull()
  })

  it('returns null when nothing is configured at all', () => {
    expect(resolveSpawn('missing', project)).toBeNull()
  })
})
