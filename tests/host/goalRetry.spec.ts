import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, test, vi } from 'vitest'
import { watchGoalRetry } from '../../src/host/goalRetry'
import { RETRY_DEFAULTS, GOAL_RETRY_ROUTE } from '../../src/shared/goalRetry'

const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach(f => f()); vi.useRealTimers() })
function setup(overrides: Record<string, unknown> = {}, failOn?: string) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const agent = { id: 's', session: { id: 's' }, status: 'running', inbox: { nextTurn: [], nextStep: [] }, cancel: vi.fn(), whenIdle: async () => {} }
  const goal = { id: 'g', revision: 1, phase: 'active', activation: 'armed', roundsStarted: 1, maxGoalRounds: 5 }
  const resume = vi.fn()
  let fetchRoute: ((r: Request) => Promise<Response>) | undefined
  let path: string | undefined
  const services: Record<string, unknown> = { agents: { get: (id: string) => id === 's' ? agent : undefined }, goals: { get: () => goal, resume, disarm: () => {} }, sessions: { flush: async () => true },
    connection: { fetch: { register: (route: { path: string; fetch: typeof fetchRoute }) => { path = route.path; fetchRoute = route.fetch; return () => { fetchRoute = undefined } } } }, ...overrides }
  const ctx = { get: (key: string) => services[key], logger: { info: vi.fn() },
    on: (name: string, handler: (...args: unknown[]) => unknown, options?: unknown) => {
      if (name === failOn) throw Error('register')
      if (name === 'agent/request-error') assert.deepEqual(options, { prepend: true })
      handlers.set(name, handler); return () => { handlers.delete(name) }
    },
    inject: (deps: string[], cb: (ctx: unknown) => unknown) => { assert.deepEqual(deps, ['agents', 'goals', 'sessions', 'connection']); const off = cb(ctx); if (typeof off === 'function') cleanups.push(off as () => void) },
  }
  watchGoalRetry(ctx as unknown as Context)
  const emit = (event: string, ...args: unknown[]) => handlers.get(event)?.(...args)
  const request = async (action = 'read', settings?: unknown) => {
    assert.ok(fetchRoute)
    const response = await fetchRoute(new Request('http://local' + GOAL_RETRY_ROUTE, { method: 'POST', body: JSON.stringify({ sessionId: 's', goalId: 'g', revision: 1, action, settings }) }))
    return { response, data: await response.json() }
  }
  return { agent, goal, resume, handlers, emit, request, services, ctx, route: () => fetchRoute, path: () => path }
}

test('optional host route delegates native retry first and observes the complete event sequence', async () => {
  vi.useFakeTimers()
  const f = setup()
  assert.equal(f.path(), GOAL_RETRY_ROUTE)
  assert.equal((await f.request()).data.value.enabled, false)
  await f.request('configure', { ...RETRY_DEFAULTS, enabled: true, intervalSeconds: 1 })
  f.emit('agent/status', { agent: f.agent, status: 'running' })
  f.emit('session/event', f.agent.session, { type: 'turn/start', data: { turn: 1 } })
  f.emit('session/event', f.agent.session, { type: 'user/message', data: { source: { kind: 'goal', goalId: 'g', revision: 1, round: 1 } } })
  const failure = { code: 'TRANSPORT', message: 'offline' }
  const payload = { agent: f.agent, turn: 1, step: 1, failure, signal: new AbortController().signal }
  const next = vi.fn(async () => undefined)
  await f.emit('agent/request-error', payload, next)
  assert.equal(next.mock.calls.length, 1)
  f.goal.activation = 'disarmed'
  f.emit('agent/error', { agent: f.agent, turn: 1, step: 1, error: { code: failure.code, failure } })
  f.emit('session/event', f.agent.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: failure } } })
  f.agent.status = 'idle'; f.emit('agent/status', { agent: f.agent, status: 'idle' })
  assert.equal((await f.request()).data.value.status, 'waiting')
  await vi.advanceTimersByTimeAsync(1000)
  assert.deepEqual(f.resume.mock.calls, [[f.agent, { id: 'g', revision: 1 }]])
  assert.equal((await f.request()).data.value.status, 'resumed')
  assert.equal(f.ctx.logger.info.mock.calls.length, 2)
  f.emit('agent/inbox/inserted', { agent: f.agent })
  f.emit('goal/changed', { agent: f.agent })
  f.emit('agent/disposed', { agent: f.agent })
  assert.equal((await f.request()).data.value.enabled, false)
})

test('route rejects malformed and stale commands, with no cache', async () => {
  const f = setup()
  assert.equal((await f.request('configure', { ...RETRY_DEFAULTS, intervalSeconds: 0 })).response.status, 409)
  f.goal.revision++
  const result = await f.request()
  assert.equal(result.response.status, 409); assert.deepEqual(result.data, { ok: false })
  assert.equal(result.response.headers.get('cache-control'), 'no-store')
  const route = f.route()!
  assert.equal((await route(new Request('http://local', { method: 'POST', body: '{' }))).status, 409)
})

test.each([
  { agents: null }, { agents: { get: 1 } }, { goals: { get: null } }, { goals: { get() {} } },
  { goals: { get() {}, resume() {} } }, { sessions: {} }, { connection: null },
  { connection: { fetch: { get register() { throw Error('hostile') } } } },
])('missing or hostile optional seams keep the plugin usable: %#', overrides => {
  const f = setup(overrides); assert.equal(f.route(), undefined)
})

test('partial registration is disposed and malformed bus events never escape', async () => {
  const partial = setup({}, 'agent/error')
  const f = setup()
  for (const name of ['agent/status', 'agent/error', 'goal/changed', 'agent/disposed', 'agent/inbox/inserted']) {
    f.emit(name, null); f.emit(name, { get agent() { throw Error('getter') } })
  }
  f.emit('session/event', null, null)
  f.emit('session/event', { id: 'other' }, null)
  f.emit('session/event', { id: 's' }, null)
  f.emit('session/event', f.agent.session, null)
  const next = vi.fn(async () => ({ kind: 'retry' }))
  assert.deepEqual(await f.emit('agent/request-error', { get agent() { throw Error('getter') } }, next), { kind: 'retry' })
  assert.equal(next.mock.calls.length, 1)
  await assert.rejects(async () => f.emit('agent/request-error', { agent: f.agent }, async () => { throw Error('downstream') }), /downstream/)
  let rejected = false
  try { await f.emit('agent/request-error', { agent: f.agent }, async () => { throw undefined }) } catch { rejected = true }
  assert.equal(rejected, true)
  await f.request('configure', { ...RETRY_DEFAULTS, enabled: true })
  assert.deepEqual(await f.emit('agent/request-error', { agent: f.agent, get failure() { throw Error('getter') } }, next), { kind: 'retry' })
  cleanups.splice(0).forEach(off => off())
  assert.equal(f.handlers.size, 0); assert.equal(partial.handlers.size, 0); assert.equal(f.route(), undefined)
})
