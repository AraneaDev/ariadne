import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf8')

describe('the slash command', () => {
  const cmd = read('commands/ariadne.md')

  it('has frontmatter with a description', () => {
    expect(cmd).toMatch(/^---\n[\s\S]*description:[\s\S]*\n---/)
  })

  it('runs the report', () => {
    expect(cmd).toContain('ariadne report')
  })
})

describe('the README', () => {
  const readme = read('README.md')

  it('states the honest limits', () => {
    expect(readme).toContain('Honest limits')
    expect(readme).toContain('estimate')
  })

  it('states what it never does', () => {
    expect(readme).toContain('never')
    expect(readme).toContain('arguments')
  })

  it('uses no em dashes', () => {
    expect(readme).not.toContain('—')
  })

  it('never refers to itself as we', () => {
    expect(readme).not.toMatch(/\b[Ww]e (?:run|built|measure|ship)\b/)
  })
})
