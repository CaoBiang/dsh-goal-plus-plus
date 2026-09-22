import assert from 'node:assert/strict'
import { test } from 'vitest'
import { goalFieldsOf, goalRoundsOf, goalTokensOf } from '../../src/client/goalTokens'

test('goal token payloads isolate goals and sanitize hostile accounting', () => {
  const hostile = new Proxy({}, { get() { throw new Error('bad') } })
  for (const value of [undefined, null, 1, [], {}, hostile, { goalId: 'other' }]) assert.equal(goalTokensOf(value, 'g'), null)
  const empty = goalTokensOf({ goalId: 'g' }, 'g')!
  assert.equal(empty.current, null)
  assert.equal(empty.anchor, null)
  assert.equal(empty.contextWindow, null)
  const value = goalTokensOf({ goalId: 'g', round: 2, usage: { outputTokens: 12, cacheReadTokens: -1 },
    current: { total: 50, user: NaN }, composition: { system: 10 }, contextWindow: 100,
    anchor: { prompt: 40, total: 20 }, roundInput: Infinity, roundOutput: 'bad' }, 'g')!
  assert.equal(value.usage.outputTokens, 12)
  assert.equal(value.usage.cacheReadTokens, 0)
  assert.equal(value.current!.total, 50)
  assert.equal(value.current!.user, 0)
  assert.deepEqual(value.anchor, { prompt: 40, total: 20 })
  assert.equal(value.contextWindow, 100)
  assert.deepEqual(goalRoundsOf(null), [])
  const rows = goalRoundsOf([null, 1, {}, hostile, { turn: 0 }, { turn: 1.5 }, { turn: Infinity },
    { turn: 1, seq: 2, time: 3, total: 50, billedInput: 70, billedOutput: 5 }])
  assert.deepEqual(goalFieldsOf(hostile), {})
  assert.deepEqual(goalFieldsOf({}), {})
  assert.deepEqual(goalFieldsOf({ goalUsage: { goalId: 'g', get current() { throw new Error('bad') } } }), {})
  assert.deepEqual(goalFieldsOf({ goalUsage: { goalId: 'g' }, goalRoundId: 'g', goalRounds: rows }), { goalUsage: empty, goalRoundId: 'g', goalRounds: rows })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].billedInput, 70)
  assert.equal(rows[0].total, 50)
})
