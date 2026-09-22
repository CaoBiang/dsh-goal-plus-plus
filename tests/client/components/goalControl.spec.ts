import { act, createElement as h } from 'react'
import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { makeGoalView } from '../../../src/client/components/goalView'
import { boundedGoalRequest, goalControlValue, watchGoalControl } from '../../../src/client/goalControl'
import { asClientCtx, TestClientCtx } from '../helpers/harness'
import { click, flush, makeKit, mount, query, text } from '../helpers/kit'

const goal = { id: 'g', revision: 1, objective: 'Implement controls', phase: 'active', maxGoalRounds: 10 }
const reply = (activation = 'armed', revision = 1) => ({ ok: true, value: { ...goal, revision, activation } })
function setup(get = async (): Promise<unknown> => reply()) {
  let event: (event: unknown) => void = () => {}
  let reset = () => {}
  const off = vi.fn()
  const resetOff = vi.fn()
  const goals = { get: vi.fn(get), pause: vi.fn(async (): Promise<unknown> => reply('disarmed', 2)), resume: vi.fn(async (): Promise<unknown> => reply('armed', 2)) }
  const remote = { goals, $on: (_name: string, listener: typeof event) => { event = listener; return off } }
  const ctx = new TestClientCtx({ services: { remote, 'remote.goals': goals } })
  Object.assign(ctx, { on: (_name: string, listener: () => void) => { reset = listener; return resetOff } })
  watchGoalControl(asClientCtx(ctx))
  return { ctx, goals, off, resetOff, event: (value: unknown) => event(value), reset: () => reset() }
}
const View = makeGoalView(makeKit(), () => null)
const props = (phase = 'active', revision = 1, roundsStarted = 0) => ({ sessionId: 's', useProjection: () => ({ goal: { ...goal, phase, revision }, roundsStarted }) })

test('pending actions and revision refreshes preserve the controls without loading text', async () => {
  const f = setup()
  const m = await mount(h(View, props()))
  const button = query<HTMLButtonElement>(m.container, '.gp-control button')
  let finish!: (value: unknown) => void
  f.goals.pause.mockImplementation(() => new Promise(done => { finish = done }))
  await click(button)
  assert.equal(button.textContent, 'Pause')
  assert.equal(button.disabled, true)
  let read!: (value: unknown) => void
  f.goals.get.mockImplementation(() => new Promise(done => { read = done }))
  await m.update(h(View, props('paused', 2)))
  assert.equal(query(m.container, '.gp-control button'), button)
  assert.equal(button.textContent, 'Start')
  assert.equal(button.disabled, true)
  assert.ok(!text(query(m.container, '.gp-goal-actions > .gp-control')).includes('Reading execution state'))
  await act(async () => { finish(reply('disarmed', 2)); read(reply('disarmed', 2)) })
  assert.equal(button.disabled, false)
  await m.unmount(); f.ctx.dispose()
})

test.each(['en', 'zh'] as const)('controls pause and start with CAS and follow pushed state (%s)', async locale => {
  const f = setup()
  const kit = makeKit(locale)
  const LocalView = makeGoalView(kit, () => null)
  const m = await mount(h(LocalView, props()))
  assert.equal(query(m.container, '.gp-control button').textContent, kit.t('goal.pause'))
  await click(query(m.container, '.gp-control button'))
  assert.deepEqual(f.goals.pause.mock.calls, [['s', { id: 'g', revision: 1 }]])
  f.goals.get.mockResolvedValue(reply('disarmed', 2))
  await m.update(h(LocalView, props('paused', 2)))
  assert.equal(query(m.container, '.gp-control button').textContent, kit.t('goal.resume'))
  await click(query(m.container, '.gp-control button'))
  assert.deepEqual(f.goals.resume.mock.calls, [['s', { id: 'g', revision: 2 }]])
  await m.update(h(LocalView, props('blocked', 2, 10)))
  assert.equal(query<HTMLButtonElement>(m.container, '.gp-control button').disabled, true)
  await m.update(h(LocalView, props('complete', 2)))
  assert.equal(m.container.querySelector('.gp-control'), null)
  await m.unmount(); f.ctx.dispose()
  assert.ok(f.off.mock.calls.length > 0); assert.ok(f.resetOff.mock.calls.length > 0)
})

test('activation events and resets refresh live state; unrelated and hostile events are ignored', async () => {
  const f = setup()
  const m = await mount(h(View, props()))
  f.goals.get.mockResolvedValue(reply('disarmed'))
  await act(async () => { f.event({ sessionId: 'other' }); f.event(null); f.event({ get sessionId() { throw Error('hostile') } }) })
  assert.equal(f.goals.get.mock.calls.length, 1)
  await act(async () => { f.event({ sessionId: 's' }) })
  assert.equal(query(m.container, '.gp-control button').textContent, 'Start')
  f.goals.get.mockResolvedValue(reply())
  await act(async () => { f.reset() })
  assert.equal(query(m.container, '.gp-control button').textContent, 'Pause')
  await m.unmount(); f.ctx.dispose()
})

test.each([null, {}, { ok: false }, { ok: true }, { ok: true, value: null }, reply('unknown'), reply('armed', 3),
  { ok: true, value: { ...goal, id: 'other', activation: 'armed' } },
  { get ok() { throw Error('hostile') } },
])('bad live data resolves to retryable state: %#', async value => {
  const f = setup(async () => value)
  const m = await mount(h(View, props()))
  assert.ok(m.container.querySelector('.gp-control [role="alert"]'))
  f.goals.get.mockResolvedValue(reply())
  await click(query(m.container, '.gp-control [role="alert"] button'))
  assert.equal(m.container.querySelector('.gp-control [role="alert"]'), null)
  await m.unmount(); f.ctx.dispose()
})

test('rejected mutations can be retried without leaving controls pending', async () => {
  const f = setup()
  f.goals.pause.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ ok: false })
  const m = await mount(h(View, props()))
  for (let i = 0; i < 2; i++) {
    await click(query(m.container, '.gp-control > button'))
    assert.ok(m.container.querySelector('.gp-control [role="alert"]'))
    assert.equal(query<HTMLButtonElement>(m.container, '.gp-control > button').disabled, false)
  }
  await m.unmount(); f.ctx.dispose()
})

test('pending reads and actions cannot update a replacement goal or unmounted view', async () => {
  let resolve!: (value: unknown) => void
  const f = setup(() => new Promise(done => { resolve = done }))
  const m = await mount(h(View, props()))
  assert.ok(text(m.container).includes('Reading execution state'))
  const old = resolve
  f.goals.get.mockResolvedValue(reply('disarmed', 2))
  await m.update(h(View, props('active', 2)))
  await act(async () => { old(reply()) })
  assert.equal(query(m.container, '.gp-control button').textContent, 'Start')
  f.goals.resume.mockImplementation(() => new Promise(done => { resolve = done }))
  await click(query(m.container, '.gp-control button'))
  assert.equal(query<HTMLButtonElement>(m.container, '.gp-control button').disabled, true)
  await m.unmount()
  await act(async () => { resolve({ ok: false }) })
  f.ctx.dispose()
})

test('a newer activation event wins over an older read, even while mutation is pending', async () => {
  let finish!: (value: unknown) => void
  let stale!: (value: unknown) => void
  const f = setup(() => new Promise(done => { stale = done }))
  const m = await mount(h(View, props()))
  f.goals.get.mockResolvedValue(reply())
  await act(async () => { f.event({ sessionId: 's' }) })
  await act(async () => { stale(reply('disarmed')) })
  f.goals.pause.mockImplementation(() => new Promise(done => { finish = done }))
  await click(query(m.container, '.gp-control button'))
  await act(async () => { f.event({ sessionId: 's' }) })
  await act(async () => { finish(reply('disarmed', 2)) })
  assert.equal(query<HTMLButtonElement>(m.container, '.gp-control button').disabled, false)
  await m.unmount(); f.ctx.dispose()
})

test('optional Remote face can arrive late, be absent, malformed, hostile, or revoked', async () => {
  const m = await mount(h(View, props()))
  assert.ok(text(m.container).includes('Goal controls are unavailable'))
  const missing = new TestClientCtx()
  watchGoalControl(asClientCtx(missing)); missing.dispose()
  for (const remote of [undefined, {}, { goals: {} }, { goals: { get() {} } }, { goals: { get() {}, pause() {} } },
    { goals: { get() {}, pause() {}, resume() {} } }, { get goals() { throw Error('hostile') } }]) {
    const ctx = new TestClientCtx({ services: { remote, 'remote.goals': {} } })
    watchGoalControl(asClientCtx(ctx)); ctx.dispose()
  }
  let f!: ReturnType<typeof setup>
  await act(async () => { f = setup() })
  assert.equal(query(m.container, '.gp-control button').textContent, 'Pause')
  await act(async () => { f.ctx.dispose() })
  assert.ok(text(m.container).includes('Goal controls are unavailable'))
  await m.unmount()
})

test('subscription and synchronous read failures remain retryable; timeout settles', async () => {
  const f = setup(() => { throw Error('sync') })
  const m = await mount(h(View, props()))
  assert.ok(m.container.querySelector('.gp-control [role="alert"]'))
  await m.unmount(); f.ctx.dispose()
  const broken = setup()
  Object.assign(broken.ctx, { on() { throw Error('subscription') } })
  const n = await mount(h(View, props()))
  assert.ok(n.container.querySelector('.gp-control [role="alert"]'))
  await n.unmount(); broken.ctx.dispose()
  vi.useFakeTimers()
  try {
    const pending = boundedGoalRequest(() => new Promise(() => {}))
    const check = assert.rejects(pending, /timeout/)
    await vi.advanceTimersByTimeAsync(15_000)
    await check
  } finally { vi.useRealTimers() }
  assert.throws(() => goalControlValue(undefined))
  await flush()
})

test('older hosts expose both active-goal verbs without inventing an activation state', async () => {
  const goals = { pause: vi.fn(async () => reply('disarmed', 2)), resume: vi.fn(async () => reply('armed', 2)) }
  const ctx = new TestClientCtx({ services: { remote: { goals, $on() {} }, 'remote.goals': goals } })
  watchGoalControl(asClientCtx(ctx))
  const m = await mount(h(View, props()))
  assert.deepEqual([...m.container.querySelectorAll('.gp-control button')].map(el => el.textContent), ['Pause', 'Start'])
  await click(query(m.container, '.gp-control button:last-child'))
  assert.equal(goals.resume.mock.calls.length, 1)
  await m.update(h(View, props('paused', 2)))
  assert.equal(m.container.querySelectorAll('.gp-control button').length, 1)
  await m.unmount(); ctx.dispose()
})

test('duplicate clicks in one render submit only one mutation', async () => {
  const f = setup()
  const m = await mount(h(View, props()))
  await act(async () => {
    const button = query(m.container, '.gp-control button')
    button.click(); button.click()
  })
  assert.equal(f.goals.pause.mock.calls.length, 1)
  await m.unmount(); f.ctx.dispose()
})

test('late rejected reads after replacement or a newer event are ignored', async () => {
  let reject!: (error: Error) => void
  const f = setup(() => new Promise((_resolve, fail) => { reject = fail }))
  const m = await mount(h(View, props()))
  const old = reject
  f.goals.get.mockResolvedValue(reply())
  await act(async () => { f.event({ sessionId: 's' }); old(Error('stale')) })
  assert.equal(m.container.querySelector('.gp-control [role="alert"]'), null)
  f.goals.get.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
  await act(async () => { f.reset() })
  await m.unmount()
  await act(async () => { reject(Error('unmounted')) })
  f.ctx.dispose()
})
