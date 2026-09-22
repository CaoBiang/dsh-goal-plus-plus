import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { test, vi } from 'vitest'
import { makeGoalFiles } from '../../../src/client/components/goalFiles'
import { makePluginView } from '../../../src/client/components/pluginView'
import type { ClientCtx } from '../../../src/client/services'
import { resetTimelineDetailStores } from '../../../src/client/timelineSource'
import { click, makeKit, mount, query, text, until } from '../helpers/kit'

const data = { current: {}, requests: [], events: [], nodes: [], archive: [], fileOps: [
  { goalId: 'g', path: 'src/a.ts', kind: 'write', err: false, added: 12, removed: 4 },
] }
test.each(['en', 'zh'] as const)('goal file card has only paths and line deltas (%s)', async locale => {
  const kit = makeKit(locale)
  const View = makeGoalFiles({} as ClientCtx, kit)
  const m = await mount(h(View, { goalId: 'g' }))
  assert.ok(text(m.container).includes(kit.t('goal.filesLoading')))
  await m.update(h(View, { goalId: 'g', useProjection: () => data }))
  assert.equal(query(m.container, '.gp-file-path').textContent, 'src/a.ts')
  assert.equal(query(m.container, '.gp-file-delta').textContent, '+12−4')
  assert.equal(m.container.querySelector('details'), null)
  await m.update(h(View, { goalId: 'other', useProjection: () => ({ ...data, fileOpsFloor: 5 }) }))
  assert.ok(text(m.container).includes(kit.t('goal.filesEmpty')))
  assert.ok(text(m.container).includes(kit.t('goal.filesPartial')))
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
    await until(() => m.container.querySelector('.gp-file-path') !== null, 'files missing')
  } finally { await m.unmount(); resetTimelineDetailStores(); vi.unstubAllGlobals() }
})
