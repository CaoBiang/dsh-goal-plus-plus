import assert from 'node:assert/strict'
import { test } from 'vitest'
import { goalFilesOf } from '../../src/client/goalFiles'

const op = { goalId: 'g', kind: 'write', err: false, path: 'src/a.ts', added: 3, removed: 1 }
test('goal files aggregate successful writes only, normalize separators, and sort paths', () => {
  assert.deepEqual(goalFilesOf([op, { ...op, path: 'src\\a.ts' }, { ...op, path: 'b.ts', added: 0, removed: 0 },
    { ...op, goalId: 'other' }, { ...op, kind: 'read' }, { ...op, kind: 'search' }, { ...op, err: true }], 'g'), [
    { path: 'b.ts', added: 0, removed: 0 }, { path: 'src/a.ts', added: 6, removed: 2 },
  ])
})
test('malformed and hostile records drop individually and totals cannot overflow', () => {
  for (const value of [undefined, null, {}, 1]) assert.deepEqual(goalFilesOf(value, 'g'), [])
  assert.deepEqual(goalFilesOf([null, 1, {}, { ...op, err: undefined }, { ...op, path: 3 }, { ...op, path: ' ' },
    { ...op, added: '3' }, { ...op, added: NaN }, { ...op, added: -1 }, { ...op, removed: 0.5 },
    { ...op, get path() { throw Error('hostile') } }, op], 'g'), [{ path: 'src/a.ts', added: 3, removed: 1 }])
  const huge = { ...op, added: Number.MAX_SAFE_INTEGER, removed: Number.MAX_SAFE_INTEGER }
  assert.deepEqual(goalFilesOf([huge, huge], 'g'), [{ path: op.path, added: huge.added, removed: huge.removed }])
})
