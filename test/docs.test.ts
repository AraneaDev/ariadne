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
    expect(cmd).toContain('src/cli.ts" report')
  })

  // The command expands the report into the prompt itself, so the CLI runs
  // whatever the model decides to do. Asserting on prose naming the command
  // would pass while the thing that actually runs had drifted away from it.
  it('runs it when the command expands, not when the model chooses to', () => {
    expect(cmd).toMatch(/^!`[^`]*src\/cli\.ts" report/m)
  })

  // The report lines its labels and figures up on runs of spaces. Unfenced,
  // markdown reflows it into a paragraph and the alignment is the casualty.
  it('asks for the output in a fenced block, kept byte for byte', () => {
    expect(cmd).toContain('fenced code block')
    expect(cmd).toContain('byte for byte')
  })
})

describe('the README', () => {
  const readme = read('README.md')

  it('states its limits', () => {
    expect(readme).toContain('## Limits')
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

  it('states the build-ladder systemMessage as a named exception, not silently', () => {
    expect(readme).toContain('The one exception is the first session after install')
  })
})

describe('the no-output promise', () => {
  it('the hook comment names the session-start exception it would otherwise contradict', () => {
    const hook = read('src/hook.ts')
    expect(hook).toContain('session-start.sh')
    expect(hook).toContain('exception')
  })
})
