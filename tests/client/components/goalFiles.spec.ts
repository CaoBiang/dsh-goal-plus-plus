import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { test, vi } from 'vitest'
import { makeGoalFiles } from '../../../src/client/components/goalFiles'
import { makePluginView } from '../../../src/client/components/pluginView'
import type { ClientCtx } from '../../../src/client/services'
import { resetTimelineDetailStores } from '../../../src/client/timelineSource'
import { click, keydown, makeKit, mount, query, text, until } from '../helpers/kit'

const data = { current: {}, requests: [], events: [], nodes: [], archive: [], fileOps: [
  { goalId: 'g', path: 'src/a.ts', kind: 'write', err: false, added: 12, removed: 4 },
] }
test.each(['en', 'zh'] as const)('goal file overview opens a compact file dialog (%s)', async locale => {
  const kit = makeKit(locale)
  const View = makeGoalFiles({} as ClientCtx, kit)
  const m = await mount(h(View, { goalId: 'g' }))
  assert.ok(text(m.container).includes(kit.t('goal.filesLoading')))
  await m.update(h(View, { goalId: 'g', useProjection: () => data }))
  assert.equal(m.container.querySelector('.gp-file-path'), null)
  assert.equal(query(m.container, '.gp-file-delta').textContent, '+12−4')
  assert.ok(text(m.container).includes(kit.t('goal.filesCount', { n: 1 })))
  await click(query(m.container, 'button'))
  const dialog = query(document.body, '[role="dialog"]')
  assert.equal(query(dialog, '.gp-file-path').textContent, 'src/a.ts')
  assert.equal(dialog.closest('.gp-files'), null)
  await keydown('Escape')
  assert.equal(document.querySelector('[role="dialog"]'), null)
  await click(query(m.container, 'button'))
  await click(query(document.body, '[role="dialog"] button[aria-label]'))
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.equal(m.container.querySelector('details'), null)
  await m.update(h(View, { goalId: 'other', useProjection: () => ({ ...data, fileOpsFloor: 5 }) }))
  assert.ok(text(m.container).includes(kit.t('goal.filesEmpty')))
  assert.ok(text(m.container).includes(kit.t('goal.filesPartialShort')))
  await m.unmount()
})
test('failed detail fetch is retryable and the file card mounts on the goal subpage', async () => {
  resetTimelineDetailStores()
  let fail = true
  vi.stubGlobal('fetch', async () => {
    if (fail) throw Error('offline')
    return { ok: true, json: async () => ({ ok: true, value: { rev: 1, ...data } }) }
  })
  const kit = makeKit()
  const View = makePluginView(kit, () => null, {} as ClientCtx)
  const m = await mount(h(View, { sessionId: 'goal-files', useProjection: key => key === 'goal'
    ? { goal: { id: 'g', objective: 'Change files', phase: 'active', revision: 1 } }
    : { ...data, fileOps: [], detailRev: 1 } }))
  try {
    await until(() => text(m.container).includes(kit.t('goal.filesRetry')), 'retry missing')
    fail = false
    await click(query(m.container, '.gp-files button'))
    await until(() => m.container.querySelector('.gp-file-delta') !== null, 'summary missing')
    await click(query(m.container, '.gp-files button'))
    assert.ok(document.querySelector('[role="dialog"] .gp-file-path'))
  } finally { await m.unmount(); resetTimelineDetailStores(); vi.unstubAllGlobals() }
})

test('file dialog paginates all retained paths, clamps shrinking data and resets when reopened or switched', async () => {
  const View = makeGoalFiles({} as ClientCtx, makeKit())
  const fileOps = Array.from({ length: 23 }, (_, i) => ({ ...data.fileOps[0], path: `src/${String(i).padStart(2, '0')}.ts`, added: 2, removed: 1 }))
  const props = { sessionId: 's', goalId: 'g', useProjection: () => ({ ...data, fileOps, fileOpsFloor: 1 }) }
  const m = await mount(h(View, props))
  assert.equal(query(m.container, '.gp-file-delta').textContent, '+46−23')
  await click(query(m.container, 'button'))
  const dialog = query(document.body, '[role="dialog"]')
  assert.ok(text(dialog).includes(makeKit().t('goal.filesPartial')))
  assert.equal(dialog.querySelectorAll('li').length, 10)
  assert.equal(query<HTMLButtonElement>(dialog, 'nav button').disabled, true)
  await click(query(dialog, 'nav button:last-child'))
  assert.equal(query(dialog, '.gp-file-path').textContent, 'src/10.ts')
  await click(query(dialog, 'nav button:last-child'))
  assert.equal(dialog.querySelectorAll('li').length, 3)
  assert.equal(query<HTMLButtonElement>(dialog, 'nav button:last-child').disabled, true)
  await click(query(dialog, 'nav button'))
  assert.equal(query(dialog, '.gp-file-path').textContent, 'src/10.ts')
  await m.update(h(View, { ...props, useProjection: () => data }))
  assert.equal(dialog.querySelectorAll('li').length, 1)
  assert.equal(query(dialog, 'nav [role="status"]').textContent, 'Page 1 of 1')
  await keydown('Escape'); await m.update(h(View, props)); await click(query(m.container, 'button'))
  assert.equal(query(document.body, '[role="dialog"] .gp-file-path').textContent, 'src/00.ts')
  await m.update(h(View, { ...props, sessionId: 'other' }))
  assert.equal(document.querySelector('[role="dialog"]'), null)
  await m.unmount()
})
