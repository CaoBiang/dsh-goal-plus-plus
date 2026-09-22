import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildTimelineDetail, createTimelineState, type TimelineEvent } from '../../src/host/fold'
import { applyGoalUsage, goalUsageView } from '../../src/host/goalUsage'
import { resolveBounds } from '../../src/host/config'
import { timelineDef, snapshotJson } from './helpers/projection'
import { assistantMessage, header, requestContext, userMessage } from './helpers/events'

const event = (type: string, data?: Record<string, unknown>): TimelineEvent => ({ type, data, seq: 1, time: 100 })
const create = (id = 'g'): TimelineEvent => event('goal/change', { operation: 'create', goal: { id } })
const admitted = (round: number, goalId = 'g'): TimelineEvent => ({ ...event('user/message', {
  content: [{ type: 'text', text: 'Continue this goal' }], source: { kind: 'goal', goalId, revision: 1, round } }), surfaceOp: 'append' })

test('goal accounting follows explicit attribution, retries, retained rounds, and goal lifecycle', () => {
  const def = timelineDef({ maxKeptTurns: 1 }, true)
  let state = def.init()
  const feed = (e: TimelineEvent): void => {
    state = def.apply(state, e)
    def.stateSchema.parse(state)
    assert.notEqual(snapshotJson(state), undefined)
    def.wire.viewSchema.parse(def.wire.view(state))
  }
  feed(header(0, { system: 'system' }))
  feed(create())
  assert.equal(def.wire.view(state).goalUsage!.current, null)
  feed(requestContext(2, { contextWindow: 1000 }))
  feed(event('turn/start', { turn: 1 }))
  feed(admitted(1))
  feed(assistantMessage(5, { turn: 1, step: 0, usage: { inputTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 5, outputTokens: 10 } }))
  assert.equal(state.goalUsage!.roundInput, 125)
  feed(assistantMessage(6, { turn: 1, step: 0, usage: { inputTokens: 110, outputTokens: 15 } }))
  assert.equal(state.goalUsage!.roundInput, 110, 'same sample replaces rather than doubles')
  feed(event('llm/retry-started', { turn: 2, step: 0 }))
  feed(event('llm/retry-started', { turn: 1, step: 9 }))
  feed(event('llm/retry-started', { turn: 1, step: 0 }))
  feed(event('assistant/attempt', { turn: 1, step: 0, stream: [null, { type: 'other' },
    { type: 'chunk', chunk: { type: 'text' } },
    { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 2 } } }] }))
  assert.equal(state.goalUsage!.roundInput, 117)
  feed(assistantMessage(7, { turn: 1, step: 1, usage: { inputTokens: 200, outputTokens: 20 } }))
  assert.equal(state.goalUsage!.usage.uncachedInputTokens, 317)
  feed(event('turn/end', { turn: 1 }))
  feed(event('turn/start', { turn: 2 }))
  feed(userMessage(8, [{ type: 'text', text: 'manual request' }]))
  feed(assistantMessage(9, { turn: 2, step: 0, usage: { inputTokens: 900 } }))
  assert.equal(state.goalUsage!.usage.uncachedInputTokens, 317)
  feed(event('turn/end', { turn: 2 }))
  feed(event('turn/start', { turn: 3 }))
  feed(admitted(2))
  feed(assistantMessage(11, { turn: 3, step: 0, usage: { inputTokens: 300, outputTokens: 30 } }))
  assert.equal(state.goalUsage!.usage.uncachedInputTokens, 617)
  assert.equal(state.goalUsage!.roundInput, 300)
  assert.equal(state.goalUsage!.rounds.length, 1)
  assert.equal(state.goalUsage!.rounds[0].turn, 2)
  assert.equal(def.wire.view(state).goalRounds, undefined, 'head stays small')
  const detail = buildTimelineDetail(state, resolveBounds({}))
  assert.equal(detail.goalRoundId, 'g')
  assert.equal(detail.goalRounds![0].billedInput, 300)
  for (const operation of ['pause', 'resume', 'edit', 'complete', 'block']) feed(event('goal/change', { operation, goal: { id: 'g' } }))
  assert.equal(state.goalUsage!.usage.uncachedInputTokens, 617)
  feed(create('g2'))
  assert.equal(state.goalUsage!.usage.uncachedInputTokens, 0)
  feed(event('goal/change', { operation: 'clear', cleared: { id: 'other' } }))
  assert.equal(state.goalUsage!.goalId, 'g2')
  feed(event('goal/change', { operation: 'clear', cleared: { id: 'g2' } }))
  assert.equal(state.goalUsage, undefined)
})

test('malformed goal records never poison the fold or its JSON cache', () => {
  const before = createTimelineState()
  const after = { ...before }
  let state = applyGoalUsage(undefined, create(), before, after, 2)!
  assert.equal(goalUsageView(state).anchor, null)
  for (const e of [create(), event('goal/change'), event('goal/change', { operation: 'create', goal: { id: '' } }),
    event('goal/change', { operation: 'create', goal: { id: 1 } }), event('turn/start', { turn: -1 }), event('unknown')]) {
    assert.equal(applyGoalUsage(state, e, before, before, 2), state)
  }
  state = applyGoalUsage(state, event('turn/start', { turn: 1 }), before, after, 2)!
  for (const source of [undefined, null, [], 1, { kind: 'user' }, { kind: 'goal', goalId: 'other' },
    { kind: 'goal', goalId: 'g', round: 'bad' }, { kind: 'goal', goalId: 'g', round: 0 }]) {
    state = applyGoalUsage(state, event('user/message', { source }), before, after, 2)!
    assert.equal(state.active, false)
  }
  state = applyGoalUsage(state, admitted(1), before, after, 2)!
  assert.equal(state.active, true)
  assert.equal(applyGoalUsage(state, event('unknown'), before, before, 2), state)
  assert.equal(applyGoalUsage(state, event('llm/retry-started', { turn: 1, step: 0 }), before, before, 2), state)
  for (const data of [{}, { turn: 1, step: 'bad' }, { turn: 2, step: 0 }]) {
    const next = applyGoalUsage(state, event('assistant/attempt', data), before, after, 2)!
    assert.equal(next.rounds.length, 0)
  }
  for (const e of [{ ...event('assistant/attempt', { turn: 1, step: 0 }), seq: NaN },
    { ...event('assistant/attempt', { turn: 1, step: 0 }), time: Infinity }]) {
    assert.equal(applyGoalUsage(state, e, before, after, 2)!.rounds.length, 0)
  }
  for (const usage of [undefined, null, {}, { inputTokens: 'bad' }, { inputTokens: NaN },
    { inputTokens: 0, outputTokens: -5, cacheReadTokens: Infinity }]) {
    state = applyGoalUsage(state, event('assistant/message', { turn: 1, step: 0, usage }), before, after, 2)!
    assert.equal(state.roundInput, 0)
  }
  assert.equal(state.composition.total, 0)
  assert.equal(goalUsageView(state).current!.total, 0)
  assert.deepEqual(goalUsageView(state).anchor, { prompt: 0, total: 0 })
  state = { ...state, lastSample: { ...state.lastSample!, turn: 7 } }
  state = applyGoalUsage(state, event('assistant/message', { turn: 1, step: 0, usage: { inputTokens: 8 } }), before, after, 2)!
  assert.equal(state.roundInput, 8)
  state = applyGoalUsage(state, event('assistant/message', { turn: 1, step: 1,
    usage: { inputTokens: 1e308, cacheReadTokens: 1e308, outputTokens: 1e308 } }), before, after, 2)!
  assert.equal(state.roundInput, Number.MAX_SAFE_INTEGER)
  timelineDef().stateSchema.parse({ ...before, goalUsage: state })
  const def = timelineDef()
  const initial = def.apply(def.init(), create())
  const hostile = new Proxy({}, { get() { throw new Error('hostile') } })
  assert.equal(def.apply(initial, event('goal/change', hostile)), initial)
  assert.notEqual(snapshotJson(state), undefined)
})
