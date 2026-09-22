import type { GoalUsage, RequestRecord, Snapshot } from '../shared/types'

const categories = ['system', 'tools', 'user', 'inject', 'skill', 'assistant', 'tool', 'total'] as const
const buckets = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}
function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}
function composition(value: unknown): Snapshot['current'] {
  const raw = object(value)
  return Object.fromEntries(categories.map(key => [key, number(raw[key])])) as Snapshot['current']
}

/** Re-prove goal accounting at the rendering boundary, including inline legacy payloads. */
export function goalTokensOf(value: unknown, goalId: string): GoalUsage | null {
  try {
    const raw = object(value)
    if (raw.goalId !== goalId) return null
    const usage = object(raw.usage)
    const anchor = object(raw.anchor)
    return {
      goalId, round: number(raw.round),
      usage: Object.fromEntries(buckets.map(key => [key, number(usage[key])])) as unknown as GoalUsage['usage'],
      composition: composition(raw.composition),
      current: raw.current == null ? null : composition(raw.current),
      contextWindow: number(raw.contextWindow) || null,
      roundInput: number(raw.roundInput), roundOutput: number(raw.roundOutput),
      anchor: raw.anchor == null ? null : { prompt: number(anchor.prompt), total: number(anchor.total) },
    }
  } catch { return null }
}

export function goalRoundsOf(value: unknown): (RequestRecord & { turn: number; billedInput: number; billedOutput: number })[] {
  if (!Array.isArray(value)) return []
  const rows: (RequestRecord & { turn: number; billedInput: number; billedOutput: number })[] = []
  for (const item of value) {
    try {
      const raw = object(item)
      if (typeof raw.turn !== 'number' || !Number.isSafeInteger(raw.turn) || raw.turn < 1) continue
      rows.push({ ...composition(raw), turn: raw.turn, seq: number(raw.seq), time: number(raw.time),
        billedInput: number(raw.billedInput), billedOutput: number(raw.billedOutput) })
    } catch { /* One malformed round must not hide the other rounds. */ }
  }
  return rows
}

export function goalFieldsOf(raw: Record<string, unknown>): Pick<Snapshot, 'goalUsage' | 'goalRoundId' | 'goalRounds'> {
  try {
    const id = object(raw.goalUsage).goalId
    const usage = typeof id === 'string' ? goalTokensOf(raw.goalUsage, id) : null
    return { ...(usage === null ? {} : { goalUsage: usage }),
      ...(typeof raw.goalRoundId === 'string' ? { goalRoundId: raw.goalRoundId, goalRounds: goalRoundsOf(raw.goalRounds) } : {}) }
  } catch { return {} }
}
