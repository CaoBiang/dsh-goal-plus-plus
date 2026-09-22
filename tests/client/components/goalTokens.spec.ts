import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { test, vi } from 'vitest'
import { makeGoalTokens } from '../../../src/client/components/goalTokens'
import type { ClientCtx } from '../../../src/client/services'
import { resetTimelineDetailStores } from '../../../src/client/timelineSource'
import { click, hover, keydown, makeKit, mount, query, text, unhover, until } from '../helpers/kit'

const current = { system: 10, tools: 20, user: 30, inject: 0, skill: 0, assistant: 40, tool: 0, total: 100 }
const usage = { goalId: 'g', round: 2, usage: { uncachedInputTokens: 200, cacheReadTokens: 20, cacheWriteTokens: 0, outputTokens: 30 },
  composition: current, current, contextWindow: 1000, roundInput: 110, roundOutput: 20, anchor: { prompt: 90, total: 80 } }
const rows = [1, 2].map(turn => ({ ...current, seq: turn, time: 100, turn, billedInput: 110, billedOutput: 15 }))
const data = { current, requests: [], events: [], nodes: [], archive: [], goalUsage: usage, goalRoundId: 'g', goalRounds: rows }

test.each(['en', 'zh'] as const)('goal token cards reuse composition and fixed round charts (%s)', async locale => {
  const kit = makeKit(locale)
  const View = makeGoalTokens({} as ClientCtx, kit)
  const m = await mount(h(View, { goalId: 'g' }))
  assert.ok(text(m.container).includes(kit.t('goal.tokensWaiting')))
  await m.update(h(View, { goalId: 'g', useProjection: () => ({ ...data, goalUsage: null }) }))
  assert.ok(text(m.container).includes(kit.t('goal.tokensWaiting')))
  await m.update(h(View, { goalId: 'other', useProjection: () => data }))
  assert.ok(text(m.container).includes(kit.t('goal.tokensWaiting')))
  await m.update(h(View, { goalId: 'g', useProjection: () => ({ ...data, get goalUsage() { throw new Error('hostile') } }) }))
  assert.ok(text(m.container).includes(kit.t('goal.tokensWaiting')))
  await m.update(h(View, { goalId: 'g', useProjection: () => data }))
  assert.ok(text(m.container).includes(kit.t('goal.tokens')))
  assert.ok(text(m.container).includes('250'))
  assert.ok(!text(m.container).includes(kit.t('goal.tokensHint')))
  await hover(query(m.container, '.gp-info-wrap button'))
  assert.ok(text(query(document.body, '.gp-ring-details')).includes(kit.t('goal.tokensHint')))
  await keydown('Escape')
  const currentCard = query(m.container, '[data-lc-current]')
  const rings = [...m.container.querySelectorAll<HTMLElement>('.lc-donut')]
  assert.equal(rings.length, 2)
  assert.deepEqual(rings.map(ring => [ring.style.width, ring.style.height]), [['96px', '96px'], ['96px', '96px']])
  assert.equal(currentCard.querySelector('.lc-stacked'), null)
  assert.ok(text(currentCard).includes('11%'))
  assert.ok(!text(currentCard).includes('890'))
  await hover(query(currentCard, '.gp-ring-trigger'))
  assert.ok(text(query(document.body, '.gp-ring-details')).includes('890'))
  await hover(query(currentCard, '.lc-donut-seg'))
  assert.ok(currentCard.querySelector('.lc-donut-seg-on'))
  await unhover(query(currentCard, '.lc-donut'))
  assert.equal(m.container.querySelectorAll('.lc-bar').length, 2)
  assert.equal(m.container.querySelectorAll('.lc-gran').length, 0)
  const bar = query(m.container, '.lc-bar')
  await hover(bar)
  assert.ok(text(m.container).includes(kit.t('goal.tokenRound', { t: 1 })))
  await click(bar)
  await unhover(query(m.container, '.lc-chart-scroll'))
  await click(query(m.container, '.lc-turns > *'))
  await click(bar)
  await m.update(h(View, { goalId: 'g', useProjection: () => ({ ...data, goalUsage: { ...usage, anchor: null, contextWindow: null } }) }))
  await m.update(h(View, { goalId: 'g', useProjection: () => ({ ...data, goalUsage: { ...usage, current: null }, goalRoundId: 'old' }) }))
  assert.equal(m.container.querySelector('[data-lc-current]'), null)
  assert.ok(text(m.container).includes(kit.t('goal.noRounds')))
  await m.unmount()
})

test('goal detail loading retries visibly and does not merge another goal history', async () => {
  resetTimelineDetailStores()
  const kit = makeKit()
  const View = makeGoalTokens({} as ClientCtx, kit)
  let fail = true
  vi.stubGlobal('fetch', async () => {
    if (fail) throw new Error('offline')
    return { ok: true, json: async () => ({ ok: true, value: { rev: 1, ...data } }) }
  })
  const m = await mount(h(View, { goalId: 'g', sessionId: 'goal-token-detail',
    useProjection: () => ({ ...data, goalRounds: [], detailRev: 1 }) }))
  try {
    assert.ok(text(m.container).includes(kit.t('goal.tokensLoading')))
    await until(() => text(m.container).includes(kit.t('goal.tokensRetry')), 'missing retry')
    fail = false
    await click(query(m.container, '.gp-trend-card .gp-action'))
    await until(() => m.container.querySelectorAll('.lc-bar').length === 2, 'missing rounds')
  } finally {
    await m.unmount()
    resetTimelineDetailStores()
    vi.unstubAllGlobals()
  }
})
