import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { afterEach, test, vi } from 'vitest'
import { makeGoalRetry } from '../../../src/client/components/goalRetry'
import { makeGoalView } from '../../../src/client/components/goalView'
import { RETRY_DEFAULTS, type RetryView } from '../../../src/shared/goalRetry'
import { click, flush, makeKit, mount, query } from '../helpers/kit'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const props = { sessionId: 's', goalId: 'g', revision: 1 }
const initial: RetryView = { ...RETRY_DEFAULTS, attempts: 0, status: 'idle', code: null, nextAt: null }
const response = (value: unknown = initial, ok = true) => ({ ok, json: async () => ({ ok, value }) })

test('retry settings render below the objective inside the goal card', async () => {
  vi.stubGlobal('fetch', async () => response({ ...initial, enabled: true }))
  const View = makeGoalView(makeKit(), () => null)
  const m = await mount(h(View, { sessionId: 's', useProjection: () => ({
    goal: { id: 'g', revision: 1, phase: 'active', objective: 'Work' },
  }) }))
  const card = query(m.container, '.lc-card')
  assert.ok(card.querySelector('.gp-goal-heading input[type="checkbox"]'))
  assert.equal(card.querySelector('.gp-goal-heading form'), null)
  const panel = query(card, '.gp-retry-details')
  assert.ok(query(card, '.gp-objective').compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)
  assert.ok(panel.querySelector('form'))
  assert.ok(panel.querySelector('[role="status"]'))
  await m.unmount()
})

test.each([true, false])('revision changes preserve retry controls and discard stale responses (%s)', async success => {
  vi.useFakeTimers()
  const fetcher = vi.fn(async (_url: unknown, _init: RequestInit) => response())
  vi.stubGlobal('fetch', fetcher)
  const View = makeGoalRetry(makeKit())
  const m = await mount(h(View, props))
  const checkbox = query<HTMLInputElement>(m.container, 'input')
  let finish!: (value: ReturnType<typeof response>) => void
  fetcher.mockImplementationOnce(() => new Promise(done => { finish = done }))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  await m.update(h(View, { ...props, revision: 2 }))
  await act(async () => { finish(response({ ...initial, enabled: true }, success)) })
  assert.equal(query(m.container, 'input'), checkbox)
  assert.equal(checkbox.checked, false)
  assert.equal(m.container.querySelector('[role="alert"]'), null)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  assert.equal(JSON.parse(String(fetcher.mock.calls.at(-1)![1].body)).revision, 2)
  await m.unmount()
})
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test.each(['zh', 'en'] as const)('toggle expands inline settings; polling preserves edits and save persists (%s)', async locale => {
  vi.useFakeTimers()
  let view = { ...initial }
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    const command = JSON.parse(String(init.body))
    if (command.action === 'configure') view = { ...view, ...command.settings }
    if (command.action === 'cancel') view = { ...view, enabled: false, status: 'cancelled', nextAt: null }
    return response(view)
  })
  vi.stubGlobal('fetch', fetcher)
  const kit = makeKit(locale)
  const View = makeGoalRetry(kit)
  const m = await mount(h(View, props))
  assert.ok(m.container.textContent!.includes(kit.t('retry.enabled')))
  assert.equal(m.container.querySelector('form'), null)
  await click(query(m.container, 'input'))
  assert.equal(view.enabled, true)
  assert.equal(document.querySelector('[role="dialog"]'), null)
  const form = query(m.container, 'form')
  const inputs = form.querySelectorAll<HTMLInputElement>('input[type="number"]')
  await input(inputs[0], '0')
  assert.equal(query<HTMLButtonElement>(form, '[type="submit"]').disabled, true)
  await input(inputs[0], '')
  await input(inputs[1], '')
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  await input(inputs[0], '5'); await input(inputs[1], '2')
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  assert.equal(inputs[0].value, '5')
  await click(query(form, '[type="submit"]'))
  assert.deepEqual(view, { ...initial, enabled: true, intervalSeconds: 5, maxRetries: 2 })
  await click(query(m.container, 'input[type="checkbox"]'))
  assert.equal(m.container.querySelector('form'), null)
  assert.equal(m.container.querySelector('.gp-retry-details'), null)
  await m.unmount()
})

test('waiting countdown and explicit cancellation round trip, polling stops after unmount', async () => {
  vi.useFakeTimers()
  let view: RetryView = { ...initial, enabled: true, status: 'waiting', attempts: 1, nextAt: Date.now() + 5000 }
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    const command = JSON.parse(String(init.body))
    if (command.action === 'cancel') view = { ...view, status: 'cancelled', nextAt: null, enabled: false }
    return response(view)
  })
  vi.stubGlobal('fetch', fetcher)
  const m = await mount(h(makeGoalRetry(makeKit()), props))
  assert.ok(m.container.textContent!.includes('5s'))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  assert.ok(m.container.textContent!.includes('4s'))
  await click(query(m.container, '.gp-retry-details > .gp-control > button'))
  assert.equal(view.status, 'cancelled')
  await m.unmount(); const count = fetcher.mock.calls.length
  await vi.advanceTimersByTimeAsync(5000); assert.equal(fetcher.mock.calls.length, count)
})

test('invalid replies and save failures are visible and polling can recover', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn(async () => response(null))
  vi.stubGlobal('fetch', fetcher)
  const m = await mount(h(makeGoalRetry(makeKit()), props))
  assert.ok(m.container.querySelector('[role="alert"]'))
  fetcher.mockResolvedValue(response(initial, false))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  fetcher.mockResolvedValue(response())
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  assert.equal(m.container.querySelector('[role="alert"]'), null)
  fetcher.mockResolvedValue(response({ ...initial, enabled: true }))
  await click(query(m.container, 'input'))
  fetcher.mockRejectedValue(Error('offline'))
  await click(query(document.body, '[type="submit"]'))
  assert.ok(m.container.querySelector('[role="alert"]'))
  await m.unmount()
})

test('timeout aborts requests, skips concurrent polls and recovers visibly', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn((_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => { reject(Error('aborted')) }, { once: true })
  }))
  vi.stubGlobal('fetch', fetcher)
  const m = await mount(h(makeGoalRetry(makeKit()), props))
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  assert.ok(m.container.querySelector('[role="alert"]'))
  assert.ok(fetcher.mock.calls.length <= 2)
  await m.unmount(); await flush()
})

test('late success from an unmounted goal cannot update the next goal', async () => {
  let finish!: (value: unknown) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
  const m = await mount(h(makeGoalRetry(makeKit()), props))
  await m.unmount(); finish(response()); await flush()
})
