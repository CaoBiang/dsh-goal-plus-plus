import assert from 'node:assert/strict'
import { test } from 'vitest'
import { goalAgentsOf } from '../../src/client/goalAgents'

test('direct children are isolated, ordered and sanitized independently', () => {
  const hostile = { get title(): never { throw new Error('hostile row') } }
  const rows = {
    root: { parentId: 'root' },
    parent: {}, sibling: { parentId: 'parent' }, nested: { parentId: 'a' },
    bad: null, primitive: 3, blank: { parentId: 'root', blank: true }, hostile,
    badStats: { parentId: 'root', projectionValues: { get subagent(): never { throw new Error('bad stats') } } },
    z: { parentId: 'root', updatedAt: 3 },
    b: { parentId: 'root', title: 'Title', updatedAt: 2 },
    a: { parentId: 'root', displayTitle: 'Display', updatedAt: 2 },
    c: { parentId: 'root', projectionValues: { subagent: { label: 'Worker', mode: 'continuable' } } },
  }
  assert.deepEqual(goalAgentsOf({ byId: rows }, 'root')?.map(a => [a.id, a.label]), [
    ['z', 'z'], ['a', 'Display'], ['b', 'Title'], ['c', 'Worker'],
  ])
  assert.equal(goalAgentsOf({ byId: { get broken(): never { throw new Error('bad item') }, good: rows.a } }, 'root')?.length, 1)
})

test('malformed containers and missing session degrade without throwing', () => {
  for (const snapshot of [null, [], 1, {}, { byId: [] }, { get byId(): never { throw new Error('bad container') } }]) {
    assert.equal(goalAgentsOf(snapshot, 'root'), null)
  }
  assert.equal(goalAgentsOf({ byId: {} }, undefined), null)
  assert.equal(goalAgentsOf({ byId: {} }, ''), null)
  assert.deepEqual(goalAgentsOf({ byId: {} }, 'root'), [])
})
