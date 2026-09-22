import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { TimelineEvent } from '../../src/host/fold'
import { buildTimelineDetail } from '../../src/host/fold'
import { resolveBounds } from '../../src/host/config'
import { timelineDef, snapshotJson, assertPlainJson } from './helpers/projection'
import { codeDispatch, toolCall, toolResult, userMessage } from './helpers/events'

test.each(['tool/code-dispatch', 'tool/ptc-dispatch'])('file ownership survives delayed results, goal replacement and replay (%s)', vocabulary => {
  const def = timelineDef()
  let state = def.init()
  let seq = 0
  const feed = (event: TimelineEvent) => {
    state = def.apply(state, { ...event, seq: ++seq, time: seq })
    def.stateSchema.parse(state)
    assert.notEqual(snapshotJson(state), undefined)
  }
  const event = (type: string, data: Record<string, unknown>): TimelineEvent => ({ type, data, seq: 0, time: 0 })
  const call = (callId: string, name = 'edit') => toolCall(0, { callId, name,
    arguments: JSON.stringify({ file_path: 'a.ts', old_string: 'old', new_string: 'new\nline' }) })
  const result = (callId: string) => toolResult(0, { callId, content: [{ type: 'text', text: 'ok' }] })
  feed(event('goal/change', { operation: 'create', goal: { id: 'g' } }))
  feed(event('turn/start', { turn: 1 }))
  const admitted = userMessage(0, [{ type: 'text', text: 'Continue goal' }])
  feed({ ...admitted, data: { ...admitted.data, source: { kind: 'goal', goalId: 'g', round: 1 } } })
  feed(call('edit')); feed(call('nested', 'run_code'))
  state = assertPlainJson(state)
  def.stateSchema.parse(state)
  feed(event('turn/end', { turn: 1 }))
  feed(event('goal/change', { operation: 'create', goal: { id: 'new' } }))
  feed(result('edit'))
  feed({ ...codeDispatch(0, { rootCallId: 'nested', name: 'write', arguments: JSON.stringify({ file_path: 'b.ts', content: 'text' }) }), type: vocabulary })
  feed(result('nested'))
  feed(call('manual')); feed(result('manual'))
  assert.deepEqual(state.fileOps.map(op => [op.path, op.goalId]), [['a.ts', 'g'], ['b.ts', 'g'], ['a.ts', undefined]])
  assert.deepEqual(state.fileOps.slice(0, 2).map(op => [op.added, op.removed]), [[2, 1], [1, 0]])
  assert.deepEqual(buildTimelineDetail(state, resolveBounds({})).fileOps, state.fileOps)
  def.wire.viewSchema.parse(def.wire.view(state))
})
