import type { ClientCtx } from '../../../src/client/services'
import { createElement as h } from 'react'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { makeGoalView } from '../../../src/client/components/goalView'
import { click, makeKit, mount, query, text } from '../helpers/kit'
import { makePluginView } from '../../../src/client/components/pluginView'
import { requestContextFocus, subscribeContextFocus, takeContextFocus } from '../../../src/client/viewFocus'

const snapshot = {
  goal: { id: 'g1', revision: 1, objective: 'Build goal support', phase: 'active', maxGoalRounds: 10 },
  roundsStarted: 0, createdAt: 1700000000000, updatedAt: 1700000000001,
}

test.each(['en', 'zh'] as const)('goal page follows lifecycle updates and recovers from bad input (%s)', async locale => {
  const kit = makeKit(locale)
  const View = makeGoalView(kit, () => null)
  const m = await mount(h(View))
  assert.ok(text(m.container).includes(kit.t('goal.unavailable')))
  for (const value of [null, 1, snapshot]) {
    await m.update(h(View, { useProjection: () => value }))
  }
  assert.ok(text(m.container).includes(snapshot.goal.objective))
  for (const phase of ['active', 'paused', 'blocked', 'complete']) {
    await m.update(h(View, { useProjection: () => ({ ...snapshot, goal: { ...snapshot.goal, phase } }) }))
    assert.equal(query(m.container, '[role="status"]').textContent, kit.t('goal.phase.' + phase))
  }
  await m.update(h(View, { useProjection: () => ({ goal: { ...snapshot.goal, phase: 'blocked', blockedReason: { message: 'Await approval' } }, createdAt: 8640000000000001 }) }))
  assert.ok(text(m.container).includes('Await approval'))
  assert.equal(m.container.querySelector('details'), null)
  await click(query(m.container, '.gp-goal-heading .gp-info-wrap button'))
  assert.ok(text(query(document.body, '.gp-ring-details')).includes('—'))
  await m.update(h(View, { useProjection: () => ({ goal: { id: 'g2', objective: 'Unknown metadata', phase: 'paused' } }) }))
  assert.equal(document.body.querySelectorAll('.gp-facts dd').length, 4)
  assert.deepEqual([...document.body.querySelectorAll('.gp-facts dd')].map(el => el.textContent), ['—', '—', 'g2', '—'])
  await m.unmount()
})

test('subpages default to goal, switch without losing props, and reset on session change', async () => {
  const View = makePluginView(makeKit(), props => h('div', { 'data-context': true }, props.sessionId, props.host), {} as ClientCtx)
  const m = await mount(h(View, { sessionId: 'pages-1', host: 'sidebar' }))
  assert.equal(query(m.container, '[aria-pressed="true"]').textContent, 'Goal')
  await click(query(m.container, 'nav button:last-child'))
  assert.equal(query(m.container, '[data-context]').textContent, 'pages-1sidebar')
  await click(query(m.container, 'nav button:first-child'))
  assert.equal(m.container.querySelector('[data-context]'), null)
  await click(query(m.container, 'nav button:last-child'))
  await m.update(h(View, { sessionId: 'pages-2' }))
  assert.equal(query(m.container, '[aria-pressed="true"]').textContent, 'Goal')
  await m.update(h(View))
  assert.equal(query(m.container, '[aria-pressed="true"]').textContent, 'Goal')
  await m.unmount()
})

test('reply jumps open context before mounting and while goal is visible; other sessions do not switch', async () => {
  const View = makePluginView(makeKit(), () => h('div', { 'data-context': true }), {} as ClientCtx)
  requestContextFocus('jump-pages', 5)
  const m = await mount(h(View, { sessionId: 'jump-pages' }))
  assert.ok(m.container.querySelector('[data-context]'))
  takeContextFocus('jump-pages')
  await click(query(m.container, 'nav button:first-child'))
  const { act } = await import('react')
  await act(async () => { requestContextFocus('other-pages', null) })
  assert.equal(m.container.querySelector('[data-context]'), null)
  await act(async () => { requestContextFocus('jump-pages', null) })
  assert.ok(m.container.querySelector('[data-context]'))
  takeContextFocus('jump-pages')
  takeContextFocus('other-pages')
  await m.unmount()
})

test('a context jump still selects the new sidebar when an existing context view consumes its pin first', async () => {
  const sessionId = 'shared-jump'
  const off = subscribeContextFocus(() => { takeContextFocus(sessionId) })
  requestContextFocus(sessionId, 9)
  assert.equal(takeContextFocus(sessionId), null)
  const View = makePluginView(makeKit(), () => h('div', { 'data-context': true }), {} as ClientCtx)
  const m = await mount(h(View, { sessionId, host: 'sidebar' }))
  assert.equal(query(m.container, '[aria-pressed="true"]').textContent, 'Context')
  await m.unmount()
  off()
})
