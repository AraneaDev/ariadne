import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/**
 * The home directory, preferring `$HOME`.
 *
 * Node consults `$HOME` first on POSIX but Bun resolves from the passwd entry and
 * ignores the environment, so a changed `HOME` is invisible to it. Reading the
 * variable first keeps the two runtimes agreeing and matches what a user expects.
 * @returns An absolute home directory path.
 */
function homeBase(): string {
  const h = process.env.HOME
  return h && isAbsolute(h) ? h : homedir()
}

/**
 * Where the pointer lives. Fixed, so a shell with no plugin environment finds it.
 * @returns The absolute pointer file path.
 */
function pointerPath(): string {
  return join(homeBase(), '.ariadne', 'data-root')
}

/**
 * Record where the hooks are writing.
 *
 * Claude Code sets `CLAUDE_PLUGIN_DATA` for a plugin hook but not for a shell, so
 * the CLI would otherwise read a different directory from the one the hooks write
 * and report an empty ledger. Best effort throughout: losing the pointer costs
 * discoverability, never correctness.
 * @param root The data root the caller resolved.
 */
function rememberDataRoot(root: string): void {
  try {
    const p = pointerPath()
    if (existsSync(p) && readFileSync(p, 'utf8').trim() === root) return
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, root)
  } catch {
    // A read-only home is not a reason to fail a tool call.
  }
}

/**
 * Read the pointer a hook left behind, or null when there is none worth trusting.
 * @returns The remembered root, or null.
 */
function readRememberedDataRoot(): string | null {
  try {
    const p = pointerPath()
    if (!existsSync(p)) return null
    const v = readFileSync(p, 'utf8').trim()
    return v && isAbsolute(v) && existsSync(v) ? v : null
  } catch {
    return null
  }
}

/**
 * Where the ledger lives. Tests set `ARIADNE_HOME`; the plugin gets `CLAUDE_PLUGIN_DATA`.
 * @returns The absolute data root.
 */
export function dataRoot(): string {
  const explicit = process.env.ARIADNE_HOME ?? process.env.CLAUDE_PLUGIN_DATA
  if (explicit) {
    rememberDataRoot(explicit)
    return explicit
  }
  return readRememberedDataRoot() ?? join(homeBase(), '.ariadne')
}

/** Longest path segment Ariadne will derive from untrusted input. */
const SEGMENT_MAX = 120

/**
 * The one sanitiser every derived path segment goes through.
 *
 * Hook payloads, server names and CLI argv all end up as path segments. Anything
 * outside `[a-zA-Z0-9._-]` becomes a dash, which removes every separator with it;
 * the result is capped below the OS name limit; and the three segments that still
 * escape a directory, `''`, `'.'` and `'..'`, collapse to a fixed fallback. The
 * output can therefore only name a child of the directory it is joined to.
 *
 * A non-string is treated as absent rather than coerced, so a hostile object cannot
 * reach the filesystem through `toString`.
 * @param value The untrusted input.
 * @param fallback What to return when nothing safe survives.
 * @returns A segment that can only name a direct child.
 */
export function safeSegment(value: string, fallback = 'unknown'): string {
  const raw = typeof value === 'string' ? value : ''
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, SEGMENT_MAX)
  return (cleaned === '' || cleaned === '.' || cleaned === '..') ? fallback : cleaned
}

/**
 * Nearest ancestor containing `.git`, else the directory itself.
 *
 * Pure filesystem probes rather than `git rev-parse`, because this runs on the hook
 * path and a subprocess there would cost more than the lookup it serves.
 * @param cwd The directory to start from.
 * @returns The repository root, or `cwd` resolved.
 */
export function findRepoRoot(cwd: string): string {
  let dir = resolve(cwd)
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return resolve(cwd)
    dir = parent
  }
}

/**
 * Stable project tag. Two checkouts of one repository never collide.
 *
 * Unlike Cassandra this is a tag on an event, not a directory: Ariadne's ledger is
 * machine-wide because the comparison across projects is the interesting one.
 * @param cwd Any directory inside the project.
 * @returns A slug of the form `name-deadbeef`.
 */
export function projectSlug(cwd: string): string {
  const root = findRepoRoot(cwd)
  const name = safeSegment(basename(root), 'project').slice(0, 40)
  const digest = createHash('sha256').update(root).digest('hex').slice(0, 8)
  return `${name}-${digest}`
}

/** The directories Ariadne writes to. One store for the whole machine. */
export interface Paths {
  root: string
  calls: string
  probes: string
  conns: string
  pending: string
  schemaVersion: string
}

/**
 * Resolve every path Ariadne needs.
 * @returns The resolved paths.
 */
export function paths(): Paths {
  const root = dataRoot()
  return {
    root,
    calls: join(root, 'calls'),
    probes: join(root, 'probes'),
    conns: join(root, 'conns'),
    pending: join(root, 'pending'),
    schemaVersion: join(root, 'schema-version'),
  }
}

/**
 * The daily file for a directory, named by UTC date.
 *
 * UTC rather than local time, so a ledger stays coherent across a timezone change
 * and two machines never disagree about which day a call belongs to.
 * @param dir The directory to name a file in.
 * @param when The instant to name it for.
 * @returns The absolute file path.
 */
export function dayFile(dir: string, when: Date): string {
  return join(dir, `${when.toISOString().slice(0, 10)}.jsonl`)
}
