import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { test } from 'vitest'
import { makeGoalAgents } from '../../../src/client/components/goalAgents'
import { makePluginView } from '../../../src/client/components/pluginView'
import { asClientCtx, TestClientCtx } from '../helpers/harness'
import { click, flush, makeKit, mount, query, text } from '../helpers/kit'

function feed() {
  let state: unknown = { byId: {} }
  const listeners = new Set<() => void>()
  return {
    list: { getSnapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } },
    async set(value: unknown) { await act(async () => { state = value; listeners.forEach(fn => fn()) }) },
  }
}

test.each(['en', 'zh'] as const)('live groups, summaries, navigation and session switching (%s)', async locale => {
  const sessions = feed()
  const opened: string[] = []
  const refreshed: string[] = []
  const ctx = asClientCtx(new TestClientCtx({ services: { sessions: { ...sessions,
    open: (id: string) => opened.push(id), refreshSubagents: async (id: string) => { refreshed.push(id) },
  } } }))
  const kit = makeKit(locale)
  const View = makeGoalAgents(ctx, kit)
  const m = await mount(h(View, { sessionId: 'root' }))
  assert.equal(m.container.querySelectorAll('.gp-agent-filter button').length, 2)
  assert.equal(query(m.container, '.gp-agent-filter [aria-pressed="true"]').textContent, kit.t('goal.agents.active') + ' · 0')
  assert.ok(text(m.container).includes(kit.t('goal.agents.empty')))
  const active = { parentId: 'root', running: true, title: 'Research', projectionValues: {
    subagent: { mode: 'continuable' }, subagentTiming: { settledMs: 42000 }, contextPressure: { projectedTokens: 1234 },
  } }
  await sessions.set({ byId: { worker: active, done: { parentId: 'root', projectionValues: { subagent: { mode: 'one-shot' } } }, idle: { parentId: 'root' } } })
  assert.equal(m.container.querySelectorAll('section[aria-label]')[0].querySelectorAll('li').length, 1)
  assert.equal(query(m.container, '.gp-agent-filter button:last-child').textContent, kit.t('goal.agents.inactive') + ' · 2')
  assert.ok(text(m.container).includes('42s'))
  assert.ok(text(m.container).includes(kit.fmt(1234)))
  await click(query(m.container, '.gp-agent-name'))
  assert.deepEqual(opened, ['worker'])
  await click(query(m.container, '.gp-agent-filter button:last-child'))
  assert.equal(m.container.querySelectorAll('li').length, 2)
  assert.equal(query(m.container, '.gp-agent-filter [aria-pressed="true"]').textContent, kit.t('goal.agents.inactive') + ' · 2')
  assert.ok(!text(query(m.container, '.gp-agent-list')).includes('Research'))
  await click(query(m.container, '.gp-agent-filter button:first-child'))
  await sessions.set({ byId: { worker: { ...active, running: false } } })
  assert.equal(m.container.querySelectorAll('section[aria-label]')[0].querySelectorAll('li').length, 0)
  await m.update(h(View, { sessionId: 'other' }))
  assert.equal(m.container.querySelectorAll('li').length, 0)
  assert.deepEqual(refreshed, ['root', 'other'])
  await m.unmount()
})

test('optional capabilities, unavailable snapshots and disabled navigation', async () => {
  const sessions = feed()
  for (const service of [undefined, sessions]) {
    const View = makeGoalAgents(asClientCtx(new TestClientCtx({ services: { sessions: service } })), makeKit())
    const m = await mount(h(View))
    assert.ok(text(m.container).includes('unavailable'))
    await m.update(h(View, { sessionId: 'root' }))
    await sessions.set({ byId: { child: { parentId: 'root' } } })
    if (service) {
      await click(query(m.container, '.gp-agent-filter button:last-child'))
      assert.equal((query(m.container, '.gp-agent-name') as HTMLButtonElement).disabled, true)
    }
    await m.unmount()
  }
})

test('catalog failures remain retryable, sync throws are caught, and late failures are ignored', async () => {
  const sessions = feed()
  let fail = true
  let reject: (error: Error) => void = () => {}
  let pending = false
  const View = makeGoalAgents(asClientCtx(new TestClientCtx({ services: { sessions: { ...sessions,
    refreshSubagents: () => {
      if (pending) return new Promise((_resolve, rejectPromise) => { reject = rejectPromise })
      if (fail) throw new Error('catalog offline')
      return Promise.resolve()
    },
  } } })), makeKit())
  const m = await mount(h(View, { sessionId: 'root' }))
  assert.ok(text(m.container).includes('Could not refresh'))
  fail = false
  await click(query(m.container, 'button'))
  assert.equal(m.container.querySelector('[role="status"]'), null)
  pending = true
  await m.update(h(View, { sessionId: 'other' }))
  await m.unmount()
  reject(new Error('late rejection'))
  await flush()
})

test('goal page mounts the list below goal summaries', async () => {
  const ctx = asClientCtx(new TestClientCtx({ services: { sessions: feed() } }))
  const View = makePluginView(makeKit(), () => null, ctx)
  const m = await mount(h(View, { sessionId: 'integrated', useProjection: (key: string) => key === 'goal'
    ? { goal: { id: 'g', objective: 'Work', phase: 'active' } } : undefined }))
  assert.ok(m.container.querySelector('.gp-agents'))
  await m.unmount()
})
