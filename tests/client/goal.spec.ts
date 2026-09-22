import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { goalOf, useGoalDetection } from '../../src/client/goal'

export function goalFixture() {
  return {
    goal: { id: 'goal-1', revision: 2, objective: 'Ship the goal view', phase: 'active', maxGoalRounds: 20 },
    roundsStarted: 3, createdAt: 1700000000000, updatedAt: 1700000005000,
  }
}

describe('goal projection boundary', () => {
  test('distinguishes absent capability from a cleared goal', () => {
    assert.deepEqual(goalOf(undefined), { kind: 'unavailable' })
    assert.deepEqual(goalOf(null), { kind: 'empty' })
    assert.deepEqual(useGoalDetection({}), { kind: 'unavailable' })
    assert.deepEqual(useGoalDetection({ useProjection: () => { throw Error('unavailable') } }), { kind: 'invalid' })
    assert.deepEqual(useGoalDetection({ useProjection: key => { assert.equal(key, 'goal'); return null } }), { kind: 'empty' })
  })
  test('copies the durable snapshot without inferring activation', () => {
    assert.deepEqual(goalOf(goalFixture()), { kind: 'ready', goal: {
      ...goalFixture().goal, roundsStarted: 3, createdAt: 1700000000000, updatedAt: 1700000005000, blockedReason: null,
    } })
  })
  test.each([false, 1, 'x', [], {}, { goal: null }, { goal: 1 },
    ...[{ id: 1 }, { id: ' ' }, { objective: null }, { objective: ' ' }, { phase: 'future' }]
      .map(patch => ({ goal: { ...goalFixture().goal, ...patch } })),
  ])('rejects malformed snapshots without throwing: %j', value => {
    assert.equal(goalOf(value).kind, 'invalid')
  })
  test('isolates hostile property access', () => {
    assert.equal(goalOf({ get goal() { throw Error('hostile') } }).kind, 'invalid')
    assert.equal(goalOf({ goal: { get id() { throw Error('nested') } } }).kind, 'invalid')
  })
  test.each([undefined, null, '10', -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('unknown counters remain unknown: %s', value => {
    const result = goalOf({ goal: { ...goalFixture().goal, revision: value, maxGoalRounds: value }, roundsStarted: value })
    assert.equal(result.kind, 'ready')
    if (result.kind !== 'ready') throw Error('expected goal')
    assert.equal(result.goal.revision, null)
    assert.equal(result.goal.roundsStarted, null)
    assert.equal(result.goal.maxGoalRounds, null)
  })
  test.each(['active', 'paused', 'blocked', 'complete'])('accepts phase %s and a readable blocker', phase => {
    const result = goalOf({ goal: { ...goalFixture().goal, phase, blockedReason: { message: 'Need input' } } })
    assert.equal(result.kind, 'ready')
    if (result.kind !== 'ready') throw Error('expected goal')
    assert.equal(result.goal.phase, phase)
    assert.equal(result.goal.blockedReason, 'Need input')
  })
  test('empty reasons are unknown and zero admitted rounds are valid', () => {
    const result = goalOf({ ...goalFixture(), roundsStarted: 0, goal: { ...goalFixture().goal, blockedReason: { message: ' ' } } })
    if (result.kind !== 'ready') throw Error('expected goal')
    assert.equal(result.goal.blockedReason, null)
    assert.equal(result.goal.roundsStarted, 0)
  })
})
