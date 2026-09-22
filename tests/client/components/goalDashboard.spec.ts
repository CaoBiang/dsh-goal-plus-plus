import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { afterEach, test, vi } from 'vitest'
import { makeGoalDashboard } from '../../../src/client/components/goalDashboard'
import type { GoalState } from '../../../src/client/goal'
import { resetTimelineDetailStores } from '../../../src/client/timelineSource'
import { TestClientCtx, asClientCtx } from '../helpers/harness'
import { click, makeKit, mount, query, text, until } from '../helpers/kit'

const goal: GoalState = { id: 'g', objective: 'Ship', phase: 'active', revision: 1, createdAt: 1000,
  updatedAt: 5000, roundsStarted: 3, maxGoalRounds: 10, blockedReason: null }
const data = { current: {}, requests: [], events: [], nodes: [], archive: [], goalUsage: { goalId: 'g', executionMs: 12000 }, fileOps: [
  { goalId: 'g', path: 'a.ts', kind: 'write', err: false, added: 12, removed: 4 },
  { goalId: 'g', path: 'b.ts', kind: 'write', err: false, added: 8, removed: 1 },
  { goalId: 'other', path: 'c.ts', kind: 'write', err: false, added: 1000, removed: 1000 },
] }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); resetTimelineDetailStores() })

test.each(['en', 'zh'] as const)('dashboard shows goal-owned changes, live agents and elapsed time (%s)', async locale => {
  vi.useFakeTimers()
  vi.setSystemTime(61000)
  let snapshot: unknown = { byId: { a: { parentId: 'root', running: true }, b: { parentId: 'root' }, other: { running: true } } }
  const listeners = new Set<() => void>()
  const ctx = asClientCtx(new TestClientCtx({ services: { sessions: { list: {
    getSnapshot: () => snapshot, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  } } } }))
  const kit = makeKit(locale)
  const View = makeGoalDashboard(ctx, kit)
  const m = await mount(h(View, { goal, sessionId: 'root', useProjection: () => data }))
  assert.equal(m.container.querySelectorAll('.gp-dashboard-cell').length, 4)
  assert.ok(text(m.container).includes('12s'))
  assert.equal(query(m.container, '.gp-file-delta').textContent, '+20−5')
  assert.equal(query<HTMLElement>(m.container, '.gp-dashboard-bar i').style.width, '80%')
  assert.equal(query(m.container, '.gp-dashboard-cell:last-child strong').textContent, '1')
  assert.equal(query(m.container, '.gp-dashboard-cell:last-child small').textContent, kit.t('goal.dashboard.agentTotal', { n: 2 }))
  assert.equal(m.container.querySelector('.gp-dashboard-cell:last-child svg'), null)
  assert.equal(query(m.container, '.gp-dashboard-phase').tagName.toLowerCase(), 'svg')
  await act(async () => { vi.advanceTimersByTime(1000); snapshot = { byId: {} }; listeners.forEach(fn => fn()) })
  assert.ok(text(m.container).includes('12s'), 'idle wall time does not increase execution time')
  assert.equal(query(m.container, '.gp-dashboard-cell:last-child strong').textContent, '0')
  for (const phase of ['paused', 'blocked', 'complete'] as const) {
    await m.update(h(View, { goal: { ...goal, phase }, sessionId: 'root', useProjection: () => ({ ...data, fileOpsFloor: 2 }) }))
    assert.ok(text(m.container).includes(kit.t('goal.phase.' + phase)))
  }
  assert.ok(text(m.container).includes('12s'))
  assert.ok(text(m.container).includes(kit.t('goal.filesPartialShort')))
  await act(async () => { vi.advanceTimersByTime(2000) })
  assert.ok(text(m.container).includes('12s'))
  await m.update(h(View, { goal, useProjection: () => ({ ...data, goalUsage: { goalId: 'g', executionMs: 15000 } }) }))
  assert.ok(text(m.container).includes('15s'))
  await m.update(h(View, { goal, useProjection: () => ({ ...data, goalUsage: { goalId: 'other', executionMs: 999999 } }) }))
  assert.equal(query(m.container, '.gp-dashboard-cell strong').textContent, '—')
  await m.unmount()
  assert.equal(vi.getTimerCount(), 0)
})

test('unknown metadata, unavailable data and zero edits never invent metrics', async () => {
  const View = makeGoalDashboard(asClientCtx(new TestClientCtx()), makeKit())
  const m = await mount(h(View, { goal: { ...goal, createdAt: null, roundsStarted: null } }))
  assert.equal(query(m.container, '.gp-file-delta').textContent, '+—−—')
  assert.ok(text(m.container).includes('— rounds started'))
  for (const patch of [{ phase: 'complete' as const, updatedAt: null }, { createdAt: Number.MAX_SAFE_INTEGER }]) {
    await m.update(h(View, { goal: { ...goal, ...patch }, useProjection: () => ({ ...data, goalUsage: { goalId: 'g' }, fileOps: [] }) }))
    assert.equal(query(m.container, '.gp-dashboard-cell strong').textContent, '—')
    assert.equal(query(m.container, '.gp-file-delta').textContent, '+0−0')
  }
  await m.unmount()
})

test('detail loading does not show zero edits, and a failed fetch can retry', async () => {
  let succeed = false
  vi.stubGlobal('fetch', async () => {
    if (!succeed) throw new Error('offline')
    return { ok: true, json: async () => ({ ok: true, value: { rev: 1, ...data } }) }
  })
  const View = makeGoalDashboard(asClientCtx(new TestClientCtx()), makeKit())
  const m = await mount(h(View, { goal, sessionId: 'dash-retry', useProjection: () => ({ ...data, fileOps: [], detailRev: 1 }) }))
  await until(() => m.container.querySelector('button') !== null, 'retry missing')
  assert.equal(query(m.container, '.gp-file-delta').textContent, '+—−—')
  succeed = true
  await click(query(m.container, 'button'))
  await until(() => query(m.container, '.gp-file-delta').textContent === '+20−5', 'changes missing')
  await m.unmount()
})
