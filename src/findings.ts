import type { CallEvent, ConnEvent, ProbeEvent, Source } from './types'

export type { CallEvent, ConnEvent, ProbeEvent } from './types'

/** Everything a report reads. */
export interface LedgerSlice {
  calls: CallEvent[]
  probes: ProbeEvent[]
  conns: ConnEvent[]
}

/** The findings this version can produce. */
export type FindingId =
  | 'paid-for-never-used'
  | 'larger-than-advertised'
  | 'configured-absent'
  | 'twice-over'
  | 'low-reach'

/** One thing worth telling you, with what it rests on. */
export interface Finding {
  id: FindingId
  title: string
  evidence: string[]
  derivedFrom: Source[]
}

/**
 * Bytes per estimated token.
 *
 * A rough constant, chosen because no tokenizer that ships on npm uses Claude's
 * vocabulary and a precise-looking wrong number is worse than an openly rough one.
 * Every figure derived from it is printed as an estimate, with its byte count
 * beside it.
 */
const BYTES_PER_TOKEN = 3.6

/** Minimum calls before a result-size distribution says anything. */
const MIN_CALLS_FOR_SIZE = 5
/** How much bigger than its description a result must be to count as oversized. */
const SIZE_TO_DESC_RATIO = 20
/** Minimum failed sessions and days before an absent server is called absent. */
const MIN_ABSENT_SESSIONS = 2
const MIN_ABSENT_DAYS = 2
/** A server must expose at least this many tools before reach means anything. */
const WIDE_SERVER_TOOLS = 10
/** Reached this few tools, and it is a low-reach server. */
const LOW_REACH_TOOLS = 2
/** Minimum sessions before reach is a pattern rather than a quiet week. */
const MIN_REACH_SESSIONS = 3

/**
 * Estimated tokens for a byte count.
 * @param bytes The exact byte count.
 * @returns A rounded estimate. Always presented as an estimate.
 */
export function estimateTokens(bytes: number): number {
  return Math.round(bytes / BYTES_PER_TOKEN)
}

/**
 * Format a number with thousands separators.
 * @param value The number.
 * @returns The grouped string.
 */
function n(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * The median of a list, or 0 when it is empty.
 * @param values The values.
 * @returns The median.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0)
}

/**
 * The last probe for each server, which is the one describing what is installed now.
 * @param probes Every probe in the slice.
 * @returns One probe per server.
 */
function latestProbes(probes: ProbeEvent[]): Map<string, ProbeEvent> {
  const out = new Map<string, ProbeEvent>()
  for (const p of probes) {
    const prev = out.get(p.server)
    if (!prev || p.ts > prev.ts) out.set(p.server, p)
  }
  return out
}

/**
 * Strip a tool name down to what it does, for cross-server comparison.
 *
 * `docker_list_containers` and `list_containers` are the same job under two names,
 * and the only thing separating them is a prefix naming the thing they act on.
 * @param name The tool name.
 * @returns A normalised comparison key.
 */
function normaliseToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * A server was probed and never called.
 *
 * The first finding people install for. It names what the server costs per request
 * whether or not you reach for it.
 * @param slice The ledger slice.
 * @returns At most one finding.
 */
function paidForNeverUsed(slice: LedgerSlice): Finding[] {
  const called = new Set(slice.calls.filter((c) => c.server !== null).map((c) => c.server as string))
  const idle = [...latestProbes(slice.probes).values()]
    .filter((p) => p.ok && p.tool_count > 0 && !called.has(p.server))
  if (idle.length === 0) return []

  const total = idle.reduce((sum, p) => sum + p.defs_bytes, 0)
  return [{
    id: 'paid-for-never-used',
    title: idle.length === 1
      ? `1 server was connected and never called`
      : `${idle.length} servers were connected and never called`,
    evidence: [
      ...idle.map((p) => `${p.server}: ${p.tool_count} tools, ${n(p.defs_bytes)} bytes (~${n(estimateTokens(p.defs_bytes))} estimated tokens) injected per request`),
      `Together they cost ${n(total)} bytes (~${n(estimateTokens(total))} estimated tokens) on every turn, whether or not you reach for them.`,
    ],
    derivedFrom: ['probe', 'hook'],
  }]
}

/**
 * A tool returns far more than its description implies.
 * @param slice The ledger slice.
 * @returns One finding per oversized tool.
 */
function largerThanAdvertised(slice: LedgerSlice): Finding[] {
  const out: Finding[] = []
  for (const probe of latestProbes(slice.probes).values()) {
    for (const tool of probe.tools) {
      const sizes = slice.calls
        .filter((c) => c.server === probe.server && c.tool === tool.name && c.ok)
        .map((c) => c.out_bytes)
      // A tool called once is not a measurement.
      if (sizes.length < MIN_CALLS_FOR_SIZE) continue
      const mid = median(sizes)
      const desc = Math.max(tool.desc_bytes, 1)
      if (mid / desc < SIZE_TO_DESC_RATIO) continue
      out.push({
        id: 'larger-than-advertised',
        title: `mcp__${probe.server}__${tool.name} returns ${Math.round(mid / desc)} times what its description implies`,
        evidence: [
          `Description: ${n(desc)} bytes. Median result over ${sizes.length} calls: ${n(Math.round(mid))} bytes (~${n(estimateTokens(mid))} estimated tokens).`,
          `Largest single result: ${n(Math.max(...sizes))} bytes.`,
        ],
        derivedFrom: ['hook', 'probe'],
      })
    }
  }
  return out
}

/**
 * A server has been failing to connect, session after session.
 * @param slice The ledger slice.
 * @returns One finding per absent server.
 */
function configuredAbsent(slice: LedgerSlice): Finding[] {
  const byServer = new Map<string, ConnEvent[]>()
  for (const c of slice.conns) {
    const list = byServer.get(c.server) ?? []
    list.push(c)
    byServer.set(c.server, list)
  }

  const out: Finding[] = []
  for (const [server, events] of byServer) {
    const sorted = [...events].sort((a, b) => (a.ts < b.ts ? -1 : 1))
    const lastOk = sorted.filter((e) => e.ok).at(-1)
    const failures = sorted.filter((e) => !e.ok && (!lastOk || e.ts > lastOk.ts))
    if (failures.length === 0) continue

    const sessions = new Set(failures.map((f) => f.session)).size
    const days = new Set(failures.map((f) => f.ts.slice(0, 10)))
    if (sessions < MIN_ABSENT_SESSIONS || days.size < MIN_ABSENT_DAYS) continue

    const first = failures[0]?.ts.slice(0, 10) ?? ''
    const sources = [...new Set(failures.map((f) => f.source))]
    out.push({
      id: 'configured-absent',
      title: `${server} has failed to connect in every session since ${first}`,
      evidence: [
        `${failures.length} failed connections across ${sessions} sessions on ${days.size} days. Last error class: ${failures.at(-1)?.err ?? 'unknown'}.`,
        `Its tools have not existed for any of them.`,
      ],
      derivedFrom: sources,
    })
  }
  return out
}

/**
 * Two servers doing the same job.
 * @param slice The ledger slice.
 * @returns At most one finding per overlapping pair.
 */
function twiceOver(slice: LedgerSlice): Finding[] {
  const probes = [...latestProbes(slice.probes).values()].filter((p) => p.ok)
  const byHash = new Map<string, Set<string>>()
  const byName = new Map<string, Set<string>>()

  for (const p of probes) {
    for (const t of p.tools) {
      const h = byHash.get(t.schema_hash) ?? new Set()
      h.add(p.server)
      byHash.set(t.schema_hash, h)

      const key = normaliseToolName(t.name)
      const seen = [...byName.keys()].find((k) => k.includes(key) || key.includes(k)) ?? key
      const set = byName.get(seen) ?? new Set()
      set.add(p.server)
      byName.set(seen, set)
    }
  }

  const pairs = new Set<string>()
  for (const servers of [...byHash.values(), ...byName.values()]) {
    if (servers.size < 2) continue
    pairs.add([...servers].sort().join(' and '))
  }
  if (pairs.size === 0) return []

  const callsByServer = new Map<string, number>()
  for (const c of slice.calls) {
    if (c.server) callsByServer.set(c.server, (callsByServer.get(c.server) ?? 0) + 1)
  }

  return [...pairs].map((pair) => ({
    id: 'twice-over' as const,
    title: `${pair} expose tools that do the same thing`,
    evidence: [
      ...pair.split(' and ').map((s) => `${s}: ${callsByServer.get(s) ?? 0} calls recorded.`),
      'Matched on name and schema only. A near-copy under an unrelated name would not be caught.',
    ],
    derivedFrom: ['probe', 'hook'] as Source[],
  }))
}

/**
 * A wide server used for almost nothing.
 * @param slice The ledger slice.
 * @returns One finding per low-reach server.
 */
function lowReach(slice: LedgerSlice): Finding[] {
  const out: Finding[] = []
  for (const probe of latestProbes(slice.probes).values()) {
    if (!probe.ok || probe.tool_count < WIDE_SERVER_TOOLS) continue
    const calls = slice.calls.filter((c) => c.server === probe.server)
    if (calls.length === 0) continue
    const sessions = new Set(calls.map((c) => c.session)).size
    if (sessions < MIN_REACH_SESSIONS) continue
    const reached = new Set(calls.map((c) => c.tool))
    if (reached.size > LOW_REACH_TOOLS) continue
    out.push({
      id: 'low-reach',
      title: `${probe.server} offers ${probe.tool_count} tools and you use ${reached.size}`,
      evidence: [
        `Reached across ${sessions} sessions: ${[...reached].join(', ')}.`,
        `Standing cost: ${n(probe.defs_bytes)} bytes (~${n(estimateTokens(probe.defs_bytes))} estimated tokens) per request for all ${probe.tool_count}.`,
      ],
      derivedFrom: ['probe', 'hook'],
    })
  }
  return out
}

/**
 * Turn a ledger slice into findings.
 *
 * A pure function: no state, no I/O, no clock. Every rule declares a minimum
 * evidence threshold and stays silent below it, because a distribution over four
 * calls is a guess wearing a statistic's clothes.
 *
 * Built-in tools never produce a finding. They are a baseline for reading the MCP
 * numbers, and you cannot uninstall one, so a finding about it is noise.
 * @param slice Everything the report reads.
 * @returns Every finding that met its threshold.
 */
export function findings(slice: LedgerSlice): Finding[] {
  const mcpOnly: LedgerSlice = { ...slice, calls: slice.calls.filter((c) => !c.builtin) }
  return [
    ...paidForNeverUsed(mcpOnly),
    ...largerThanAdvertised(mcpOnly),
    ...configuredAbsent(mcpOnly),
    ...twiceOver(mcpOnly),
    ...lowReach(mcpOnly),
  ]
}
