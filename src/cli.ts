#!/usr/bin/env bun
import { backfill } from './backfill'
import { runProbes } from './probe/run'
import { renderReport, sliceFor } from './report'
import { paths } from './paths'
import { rmSync } from 'node:fs'

const USAGE = `ariadne: measures what your installed MCP servers cost you

  ariadne report [--session <id>] [--project <slug>]   what it found
  ariadne probe                                        measure standing cost now
  ariadne backfill                                     import Claude Code's connection history
  ariadne purge                                        delete the ledger
`

/**
 * Read a flag's value from argv.
 *
 * A missing flag, a flag with nothing after it, an empty value and a value that
 * is itself another flag all mean the same thing: nothing was given. Treating
 * them as distinct is how a mistyped session id like `--session ""` used to slip
 * through as the empty string and silently filter the whole report down to
 * nothing, rather than being treated as no filter at all.
 * @param argv The arguments after the subcommand.
 * @param name The flag name, including its dashes.
 * @returns The value, or undefined.
 */
export function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  const v = argv[i + 1]
  return v === undefined || v === '' || v.startsWith('--') ? undefined : v
}

const [command = 'report', ...rest] = process.argv.slice(2)

switch (command) {
  case 'report': {
    process.stdout.write(renderReport(sliceFor({
      session: flag(rest, '--session'),
      project: flag(rest, '--project'),
    })))
    break
  }
  case 'probe': {
    await runProbes(process.cwd(), `cli-${Date.now()}`)
    process.stdout.write('ariadne: probed every configured server.\n')
    break
  }
  case 'backfill': {
    const { added, scanned } = backfill()
    process.stdout.write(`ariadne: imported ${added} connection events from ${scanned} log files.\n`)
    break
  }
  case 'purge': {
    rmSync(paths().root, { recursive: true, force: true })
    process.stdout.write('ariadne: ledger deleted.\n')
    break
  }
  default:
    process.stdout.write(USAGE)
}
