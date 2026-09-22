import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { GoalRetryEngine, type RetryAgent, type RetryGoal } from '../../src/host/goalRetryEngine'
import { RETRY_DEFAULTS, retryCode, retryRequestSchema, retrySettingsSchema, type RetrySettings } from '../../src/shared/goalRetry'

const engines: GoalRetryEngine[] = []
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { engines.forEach(e => e.dispose()); engines.length = 0; vi.useRealTimers() })
function setup() {
  const agent: RetryAgent = { id: 's', session: { id: 's' }, status: 'running', inbox: { nextTurn: [], nextStep: [] }, cancel: vi.fn(), whenIdle: vi.fn(async () => {}) }
  const state: { agent?: RetryAgent; goal?: RetryGoal } = { agent, goal: { id: 'g', revision: 1, phase: 'active', activation: 'armed', roundsStarted: 1, maxGoalRounds: 10 } }
  const resume = vi.fn(() => { state.goal = { ...state.goal!, revision: state.goal!.revision + 1, activation: 'armed' }; engine.changed(agent) })
  const flush = vi.fn(async () => true)
  const log = vi.fn()
  const engine = new GoalRetryEngine({ agent: () => state.agent, goal: () => state.goal, resume, flush, log })
  engines.push(engine)
  const control = (action: 'read' | 'cancel' | 'configure' = 'read', settings?: RetrySettings) => engine.control({ sessionId: 's', goalId: 'g', revision: state.goal!.revision, action, settings })
  const enable = (settings = { ...RETRY_DEFAULTS, enabled: true, intervalSeconds: 1 }) => control('configure', settings)
  const start = () => {
    agent.status = 'running'; state.goal!.activation = 'armed'
    engine.sessionEvent(agent, { type: 'turn/start', data: { turn: 1 } })
    engine.sessionEvent(agent, { type: 'user/message', data: { source: { kind: 'goal', goalId: 'g', revision: state.goal!.revision, round: 1 } } })
  }
  const fail = async (code = 'TIMEOUT', next: unknown = undefined) => {
    const abort = new AbortController()
    const payload = { turn: 1, step: 1, failure: { code }, signal: abort.signal }
    assert.equal(await engine.requestError(agent, payload, async () => next), next)
    engine.error(agent, { turn: 1, step: 1, error: { code, failure: { code } } })
    state.goal!.activation = 'disarmed'
    engine.sessionEvent(agent, { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { code } } } })
    agent.status = 'idle'; engine.idle(agent)
    return abort
  }
  return { agent, state, engine, control, enable, start, fail, resume, flush, log }
}

test('defaults, strict input validation and canonical temporary error taxonomy', () => {
  assert.deepEqual(RETRY_DEFAULTS, { enabled: false, intervalSeconds: 30, maxRetries: 3 })
  for (const code of ['TRANSPORT', 'TIMEOUT', 'SERVER', 'EMPTY_RESPONSE', 'RATE_LIMIT']) assert.equal(retryCode({ code }), code)
  for (const value of [null, [], 1, {}, { code: 3 }, { code: 'QUOTA', status: 429 }, { message: 'timeout' }]) assert.equal(retryCode(value), null)
  for (const n of [0, -1, 0.1, Infinity, NaN]) {
    assert.equal(retrySettingsSchema.safeParse({ ...RETRY_DEFAULTS, maxRetries: n }).success, false)
    assert.equal(retrySettingsSchema.safeParse({ ...RETRY_DEFAULTS, intervalSeconds: n }).success, false)
  }
  assert.equal(retrySettingsSchema.safeParse({ ...RETRY_DEFAULTS, intervalSeconds: 2147484 }).success, false)
  assert.equal(retryRequestSchema.safeParse({ sessionId: 's', goalId: 'g', revision: 1, action: 'configure', settings: RETRY_DEFAULTS }).success, true)
  assert.equal(retryRequestSchema.safeParse({ sessionId: '', goalId: 'g', revision: 1, action: 'read' }).success, false)
})

test('final transient errors resume the same goal with CAS, once per wait, bounded across successes and toggles', async () => {
  const f = setup()
  assert.equal(f.control().enabled, false)
  f.enable()
  for (let i = 0; i < 4; ++i) {
    f.start(); await f.fail()
    f.engine.idle(f.agent)
    if (i < 3) {
      assert.equal(f.control().status, 'waiting')
      await vi.advanceTimersByTimeAsync(999); assert.equal(f.resume.mock.calls.length, i)
      await vi.advanceTimersByTimeAsync(1)
      assert.equal(f.control().status, 'resumed')
      assert.equal(f.control().attempts, i + 1)
      assert.deepEqual(f.resume.mock.calls[i], [f.agent, { id: 'g', revision: i + 1 }])
      f.control('configure', { ...RETRY_DEFAULTS, enabled: false }); f.enable()
    } else { assert.equal(f.control().status, 'exhausted'); await vi.advanceTimersByTimeAsync(4000) }
  }
  assert.equal(f.resume.mock.calls.length, 3)
  assert.equal(f.flush.mock.calls.length, 3)
})

test.each(['AUTH', 'QUOTA', 'CONTEXT', 'UNKNOWN', 'MAX_TOKENS', 'INVALID_REQUEST'])('terminal %s never recovers', async code => {
  const f = setup(); f.enable(); f.start(); await f.fail(code)
  await vi.advanceTimersByTimeAsync(2000); assert.equal(f.resume.mock.calls.length, 0)
})

test('native retry takes priority, disabled and unattributed runs never recover', async () => {
  const f = setup(); f.start(); await f.fail(); assert.equal(f.control().status, 'idle')
  f.enable(); f.start(); await f.fail('TIMEOUT', { kind: 'retry' })
  await vi.advanceTimersByTimeAsync(2000); assert.equal(f.resume.mock.calls.length, 0)
  f.start(); f.engine.sessionEvent(f.agent, { type: 'user/message', data: { source: { kind: 'user' } } }); await f.fail()
  f.start(); f.engine.sessionEvent(f.agent, { type: 'user/message', data: { source: { kind: 'goal', goalId: 'other', round: 1 } } }); await f.fail()
  assert.equal(f.resume.mock.calls.length, 0)
})

test.each(['cancel', 'stop', 'change', 'input', 'off', 'dispose', 'abort'] as const)('%s cancels pending recovery', async action => {
  const f = setup(); const original = f.agent.cancel; f.enable(); f.start(); const abort = await f.fail()
  if (action === 'cancel') f.control('cancel')
  if (action === 'stop') f.agent.cancel({ kind: 'user' })
  if (action === 'change') f.engine.changed(f.agent)
  if (action === 'input') f.engine.activity(f.agent)
  if (action === 'off') f.control('configure', { ...RETRY_DEFAULTS, enabled: false })
  if (action === 'dispose') f.engine.dispose()
  if (action === 'abort') abort.abort()
  await vi.advanceTimersByTimeAsync(2000); assert.equal(f.resume.mock.calls.length, 0)
  if (action === 'stop') { assert.equal(f.agent.cancel, original); assert.deepEqual(vi.mocked(original).mock.calls, [[{ kind: 'user' }]]) }
})

test.each(['agent', 'goal', 'revision', 'phase', 'activation', 'rounds', 'inboxTurn', 'inboxStep', 'running', 'cancelFace'])('rechecks %s at timer expiry', async field => {
  const f = setup(); f.enable(); f.start(); await f.fail()
  if (field === 'agent') f.state.agent = undefined
  if (field === 'goal') f.state.goal = undefined
  if (field === 'revision') f.state.goal!.revision++
  if (field === 'phase') f.state.goal!.phase = 'paused'
  if (field === 'activation') f.state.goal!.activation = 'armed'
  if (field === 'rounds') f.state.goal!.roundsStarted = 10
  if (field === 'inboxTurn') f.agent.inbox.nextTurn = [{}]
  if (field === 'inboxStep') f.agent.inbox.nextStep = [{}]
  if (field === 'running') f.agent.status = 'running'
  if (field === 'cancelFace') f.agent.cancel = () => {}
  await vi.advanceTimersByTimeAsync(2000); assert.equal(f.resume.mock.calls.length, 0)
})

test.each(['flushFalse', 'flushThrow', 'resumeThrow', 'idleThrow'])('fails closed on %s', async kind => {
  const f = setup(); f.enable(); f.start(); await f.fail()
  if (kind === 'flushFalse') f.flush.mockResolvedValue(false)
  if (kind === 'flushThrow') f.flush.mockRejectedValue(Error('disk'))
  if (kind === 'resumeThrow') f.resume.mockImplementation(() => { throw Error('CAS') })
  if (kind === 'idleThrow') vi.mocked(f.agent.whenIdle).mockRejectedValue(Error('disposed'))
  await vi.advanceTimersByTimeAsync(4000)
  assert.equal(f.control().status, 'failed'); assert.equal(f.control().enabled, false)
  assert.equal(f.control().attempts, kind === 'resumeThrow' ? 1 : 0)
})

test.each(['idle', 'flush'])('cancellation during awaited %s prevents resume', async stage => {
  const f = setup(); f.enable(); f.start(); await f.fail()
  let finish!: () => void
  const pending = new Promise<void>(r => { finish = r })
  if (stage === 'idle') vi.mocked(f.agent.whenIdle).mockReturnValue(pending)
  else f.flush.mockImplementation(async () => { await pending; return true })
  await vi.advanceTimersByTimeAsync(1000)
  f.control('cancel'); finish(); await vi.advanceTimersByTimeAsync(1000)
  assert.equal(f.resume.mock.calls.length, 0); assert.equal(f.control().status, 'cancelled')
})

test('invalid final evidence and duplicate notifications never schedule extra work', async () => {
  const f = setup(); f.enable(); f.start()
  await f.engine.requestError(f.agent, { turn: 1, step: 1, failure: { code: 'TIMEOUT' }, signal: new AbortController().signal }, async () => undefined)
  f.agent.status = 'idle'; f.engine.idle(f.agent)
  assert.equal(f.control().status, 'ineligible')
  f.start(); await f.fail()
  f.engine.error(f.agent, { turn: 1, step: 1, error: Error('storage') })
  await vi.advanceTimersByTimeAsync(2000); assert.equal(f.resume.mock.calls.length, 0)
  f.start(); await f.fail()
  f.engine.sessionEvent(f.agent, { type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } })
  await vi.advanceTimersByTimeAsync(2000); assert.equal(f.resume.mock.calls.length, 0)
})

test('controls reject stale/missing/complete/frozen goals and retain counts for replacement agents', async () => {
  const f = setup()
  assert.throws(() => f.control('configure'), /Missing/)
  f.state.goal!.phase = 'complete'; assert.throws(() => f.enable(), /complete/); f.state.goal!.phase = 'active'
  assert.throws(() => f.engine.control({ sessionId: 's', goalId: 'x', revision: 1, action: 'read' }), /changed/)
  f.enable(); f.start(); await f.fail(); await vi.advanceTimersByTimeAsync(1000)
  f.state.agent = { ...f.agent, cancel: vi.fn() }
  assert.equal(f.control().attempts, 1); assert.equal(f.control().enabled, false)
  f.state.agent = undefined; assert.throws(() => f.control(), /unavailable/)
  f.engine.dispose(); assert.throws(() => f.control(), /disposed/)
  const frozen = setup(); Object.freeze(frozen.agent); assert.throws(() => frozen.enable()); assert.equal(frozen.control().enabled, false)
})

test('inherited native stop is restored, unknown events are inert, and stale async failures stay cancelled', async () => {
  const f = setup()
  const original = f.agent.cancel
  Reflect.deleteProperty(f.agent, 'cancel'); Object.setPrototypeOf(f.agent, { cancel: original })
  f.enable(); f.engine.sessionEvent(f.agent, null)
  f.engine.sessionEvent(f.agent, { type: 'turn/start', data: { turn: null } })
  f.start(); await f.fail()
  let reject!: (error: Error) => void
  f.flush.mockImplementation(() => new Promise((_resolve, r) => { reject = r }))
  await vi.advanceTimersByTimeAsync(1000)
  f.agent.cancel(); reject(Error('late storage error')); await vi.advanceTimersByTimeAsync(1)
  assert.equal(Object.hasOwn(f.agent, 'cancel'), false)
  assert.equal(f.control().status, 'cancelled')
})
