import type { GoalUsage, RequestRecord, Snapshot, TokenUsage } from '../shared/types'
import type { TimelineEvent, TimelineState } from './fold'

type Composition = Snapshot['current']
const CATEGORIES = ['system', 'tools', 'user', 'inject', 'skill', 'assistant', 'tool'] as const
const BUCKETS = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
const zeroUsage = (): TokenUsage => ({ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
const zeroComposition = (): Composition => ({ system: 0, tools: 0, user: 0, inject: 0, skill: 0, assistant: 0, tool: 0, total: 0 })

export interface GoalUsageState extends GoalUsage {
  turn: number | null
  active: boolean
  rounds: RequestRecord[]
  lastSample: { turn: number; step: number; usage: TokenUsage; composition: Composition } | null
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function bucket(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value))) : 0
}
function compositionOf(state: TimelineState): Composition {
  const current = { ...state.sums, system: state.systemTokens, tools: state.toolsTokens, total: 0 }
  current.total = CATEGORIES.reduce((n, key) => n + current[key], 0)
  return current
}

/** Mirrors token-meter: direct message usage, otherwise the last stream usage chunk. */
function usageOf(data: Record<string, unknown>, message: boolean): TokenUsage | null {
  let raw = message ? data.usage : undefined
  if (raw === undefined && Array.isArray(data.stream)) {
    for (const item of data.stream) {
      const entry = record(item)
      const chunk = record(entry.chunk)
      if (entry.type === 'chunk' && chunk.type === 'usage') raw = chunk.usage
    }
  }
  if (raw === undefined || raw === null) return null
  const usage = record(raw)
  if (![usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens]
    .some(value => typeof value === 'number' && Number.isFinite(value))) return null
  return { uncachedInputTokens: bucket(usage.inputTokens), outputTokens: bucket(usage.outputTokens),
    cacheReadTokens: bucket(usage.cacheReadTokens), cacheWriteTokens: bucket(usage.cacheWriteTokens) }
}

/** Pure, bounded accounting. Only explicitly admitted goal rounds own requests. */
export function applyGoalUsage(
  previous: GoalUsageState | undefined, event: TimelineEvent, before: TimelineState, after: TimelineState, maxRounds: number,
): GoalUsageState | undefined {
  const data = record(event.data)
  if (event.type === 'goal/change') {
    const goal = record(data.goal)
    if (data.operation === 'clear' && previous?.goalId === record(data.cleared).id) return undefined
    if (data.operation !== 'create' || typeof goal.id !== 'string' || goal.id === '' || previous?.goalId === goal.id) return previous
    return { goalId: goal.id, round: 0, usage: zeroUsage(), composition: zeroComposition(), current: null,
      contextWindow: null, roundInput: 0, roundOutput: 0, anchor: null, turn: null, active: false, rounds: [], lastSample: null }
  }
  if (previous === undefined) return previous
  if (event.type === 'turn/start' && integer(data.turn)) return { ...previous, turn: data.turn, active: false, lastSample: null }
  if (event.type === 'turn/end') return { ...previous, active: false, turn: null, lastSample: null }
  let state = previous
  if (event.type === 'user/message' && after !== before) {
    const source = record(data.source)
    if (source.kind === 'goal' && source.goalId === state.goalId && integer(source.round) && source.round > state.round) {
      state = { ...state, round: source.round, active: true, roundInput: 0, roundOutput: 0, anchor: null, lastSample: null }
    }
  }
  if (!state.active) return state
  if (event.type === 'llm/retry-started') return state.lastSample?.turn === data.turn && state.lastSample?.step === data.step
    ? { ...state, lastSample: null } : state
  const settlement = event.type === 'assistant/message' || event.type === 'assistant/attempt'
  if (after === before && !settlement) return state
  state = { ...state, current: compositionOf(after), contextWindow: after.contextWindow ?? null }
  if (!settlement || !integer(event.seq) || !integer(event.time)
    || !integer(data.turn) || !integer(data.step) || data.turn !== state.turn) return state
  const current = compositionOf(before)
  const usage = usageOf(data, event.type === 'assistant/message')
  let prompt: number | undefined
  if (usage !== null) {
    const last = state.lastSample
    const replaced = last !== null && last.turn === data.turn && last.step === data.step ? last : null
    const totals = { ...state.usage }
    const composition = { ...state.composition }
    prompt = bucket(usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)
    const allocation = zeroComposition()
    for (const key of CATEGORIES) {
      allocation[key] = current.total > 0 ? Math.round(prompt * (current[key] / current.total)) : 0
      composition[key] = bucket( composition[key] - (replaced?.composition[key] ?? 0) + allocation[key])
    }
    allocation.total = bucket(CATEGORIES.reduce((n, key) => n + allocation[key], 0))
    composition.total = bucket(CATEGORIES.reduce((n, key) => n + composition[key], 0))
    for (const key of BUCKETS) totals[key] = bucket(totals[key] + usage[key] - (replaced?.usage[key] ?? 0))
    const old = replaced?.usage ?? zeroUsage()
    state = { ...state, usage: totals, composition,
      roundInput: bucket(state.roundInput + prompt - old.uncachedInputTokens - old.cacheReadTokens - old.cacheWriteTokens),
      roundOutput: bucket(state.roundOutput + usage.outputTokens - old.outputTokens),
      anchor: { prompt, total: current.total }, lastSample: { turn: data.turn, step: data.step, usage, composition: allocation } }
  }
  const row: RequestRecord = { ...current, seq: event.seq, time: event.time, turn: state.round,
    billedInput: state.roundInput, billedOutput: state.roundOutput, ...(prompt === undefined ? {} : { prompt }) }
  const rounds = state.rounds.filter(item => item.turn !== state.round)
  rounds.push(row)
  return { ...state, rounds: rounds.slice(-maxRounds) }
}

/** The head stays small; per-round records travel through the existing detail channel. */
export function goalUsageView(state: GoalUsageState): GoalUsage {
  return { goalId: state.goalId, round: state.round, usage: { ...state.usage }, composition: { ...state.composition },
    current: state.current === null ? null : { ...state.current }, contextWindow: state.contextWindow,
    roundInput: state.roundInput, roundOutput: state.roundOutput, anchor: state.anchor === null ? null : { ...state.anchor } }
}
