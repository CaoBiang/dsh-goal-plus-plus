import { RETRY_DEFAULTS, retryCode, retryRecord, type RetryRequest, type RetryView } from '../shared/goalRetry'

export interface RetryAgent {
  id: string
  session: { id: string }
  status: string
  inbox: { nextTurn: readonly unknown[]; nextStep: readonly unknown[] }
  cancel: (...args: unknown[]) => unknown
  whenIdle(): Promise<void>
}
export interface RetryGoal { id: string; revision: number; phase: string; activation: string; roundsStarted: number; maxGoalRounds: number }
export interface RetryServices {
  agent(id: string): RetryAgent | undefined
  goal(agent: RetryAgent): RetryGoal | undefined
  resume(agent: RetryAgent, ref: { id: string; revision: number }): unknown
  flush(agent: RetryAgent): Promise<boolean>
  log(message: string): void
}
interface Candidate {
  turn: number
  step: number
  revision: number
  code: string
  signal: AbortSignal
  confirmed: boolean
  ended: boolean
  unlisten: () => void
}
interface Entry {
  agent: RetryAgent
  goalId: string
  view: RetryView
  turn?: number
  admitted?: number
  candidate?: Candidate
  timer?: ReturnType<typeof setTimeout>
  epoch: number
  restore: () => void
  cancel: RetryAgent['cancel']
  ownResume: boolean
}

/** Process-local recovery: native request retry and the native Goal driver retain ownership. */
export class GoalRetryEngine {
  private entries = new Map<string, Entry>()
  private disposed = false
  constructor(private services: RetryServices) {}

  private stop(entry: Entry, status: RetryView['status'] = 'cancelled'): void {
    ++entry.epoch
    clearTimeout(entry.timer)
    entry.timer = undefined
    entry.candidate?.unlisten()
    entry.candidate = undefined
    entry.view.nextAt = null
    entry.view.status = status
  }

  private current(agent: RetryAgent): Entry | undefined {
    return [...this.entries.values()].find(entry => entry.agent === agent && entry.view.enabled)
  }

  control(request: RetryRequest): RetryView {
    if (this.disposed) throw new Error('Retry service disposed')
    const agent = this.services.agent(request.sessionId)
    if (agent === undefined || typeof agent.cancel !== 'function' || typeof agent.whenIdle !== 'function'
      || !Array.isArray(agent.inbox.nextTurn) || !Array.isArray(agent.inbox.nextStep)) throw new Error('Live agent unavailable')
    const goal = this.services.goal(agent)
    if (goal === undefined || goal.id !== request.goalId || goal.revision !== request.revision) throw new Error('Goal changed')
    const key = JSON.stringify([agent.id, goal.id])
    let entry = this.entries.get(key)
    if (entry === undefined || entry.agent !== agent) {
      const attempts = entry?.view.attempts ?? 0
      if (entry !== undefined) { this.stop(entry); entry.restore() }
      entry = { agent, goalId: goal.id, view: { ...RETRY_DEFAULTS, attempts, status: 'idle', nextAt: null, code: null },
        epoch: 0, restore: () => {}, cancel: agent.cancel, ownResume: false }
      this.entries.set(key, entry)
    }
    if (request.action === 'cancel') { this.stop(entry); entry.view.enabled = false; entry.restore() }
    if (request.action === 'configure') {
      if (request.settings === undefined) throw new Error('Missing settings')
      if (request.settings.enabled && goal.phase === 'complete') throw new Error('Goal complete')
      this.stop(entry, 'idle')
      entry.restore()
      entry.view.enabled = false
      if (request.settings.enabled) this.guardCancel(entry)
      Object.assign(entry.view, request.settings)
    }
    return { ...entry.view }
  }

  private guardCancel(entry: Entry): void {
    const agent = entry.agent
    const descriptor = Object.getOwnPropertyDescriptor(agent, 'cancel')
    const original = agent.cancel
    const cancel = () => {
      this.stop(entry)
      entry.view.enabled = false
      entry.restore()
    }
    const wrapped: RetryAgent['cancel'] = function (this: RetryAgent, ...args) {
      cancel()
      return original.apply(this, args)
    }
    // All native stop entrances converge here, including idle cancel calls that emit no event.
    Object.defineProperty(agent, 'cancel', { configurable: true, writable: true, value: wrapped })
    entry.cancel = wrapped
    entry.restore = () => {
      if (agent.cancel !== wrapped) return
      if (descriptor !== undefined) Object.defineProperty(agent, 'cancel', descriptor)
      else Reflect.deleteProperty(agent, 'cancel')
    }
  }

  changed(agent: RetryAgent): void {
    const entry = this.current(agent)
    if (entry === undefined || entry.ownResume) return
    this.stop(entry)
    entry.view.enabled = false
    entry.restore()
  }

  activity(agent: RetryAgent): void {
    const entry = this.current(agent)
    if (entry !== undefined) { this.stop(entry); entry.admitted = undefined }
  }

  sessionEvent(agent: RetryAgent, raw: unknown): void {
    const entry = this.current(agent)
    if (entry === undefined) return
    const event = retryRecord(raw)
    const data = retryRecord(event.data)
    if (event.type === 'turn/start') {
      this.activity(agent)
      entry.turn = typeof data.turn === 'number' ? data.turn : undefined
    } else if (event.type === 'user/message') {
      const source = retryRecord(data.source)
      if (source.kind === 'goal' && source.goalId === entry.goalId && Number.isSafeInteger(source.round)
        && source.revision === this.services.goal(agent)?.revision) entry.admitted = entry.turn
      else this.activity(agent)
    } else if (event.type === 'turn/end') {
      const candidate = entry.candidate
      const reason = retryRecord(data.reason)
      if (candidate !== undefined && candidate.turn === data.turn && reason.kind === 'error'
        && retryCode(reason.error) === candidate.code) candidate.ended = true
      else this.stop(entry, 'ineligible')
    }
  }

  async requestError(agent: RetryAgent, raw: unknown, next: () => Promise<unknown>): Promise<unknown> {
    const entry = this.current(agent)
    const data = retryRecord(raw)
    const goal = this.services.goal(agent)
    const epoch = entry?.epoch
    const result = await next()
    if (entry === undefined || !entry.view.enabled || entry.epoch !== epoch) return result
    this.stop(entry, 'ineligible')
    const code = retryCode(data.failure)
    if (retryRecord(result).kind === 'retry' || code === null || goal === undefined
      || goal.id !== entry.goalId || goal.phase !== 'active' || goal.activation !== 'armed'
      || agent.status !== 'running' || entry.admitted !== data.turn || !Number.isSafeInteger(data.turn)
      || !Number.isSafeInteger(data.step) || !(data.signal instanceof AbortSignal) || data.signal.aborted) return result
    const signal = data.signal
    const cancel = () => { this.stop(entry) }
    signal.addEventListener('abort', cancel, { once: true })
    entry.candidate = { turn: data.turn as number, step: data.step as number, revision: goal.revision, code, signal,
      confirmed: false, ended: false, unlisten: () => { signal.removeEventListener('abort', cancel) } }
    entry.view.code = code
    return result
  }

  error(agent: RetryAgent, raw: unknown): void {
    const entry = this.current(agent)
    if (entry === undefined) return
    const data = retryRecord(raw)
    const candidate = entry.candidate
    const error = retryRecord(data.error)
    if (candidate !== undefined && candidate.turn === data.turn && candidate.step === data.step
      && error.code === candidate.code && retryCode(error.failure) === candidate.code) candidate.confirmed = true
    else this.stop(entry, 'failed')
  }

  private valid(entry: Entry, candidate: Candidate): boolean {
    const agent = entry.agent
    const goal = this.services.goal(agent)
    return !this.disposed && entry.view.enabled && entry.candidate === candidate && candidate.confirmed && candidate.ended
      && !candidate.signal.aborted && agent.cancel === entry.cancel && this.services.agent(agent.id) === agent
      && agent.status === 'idle' && agent.inbox.nextTurn.length === 0 && agent.inbox.nextStep.length === 0
      && goal !== undefined && goal.id === entry.goalId && goal.revision === candidate.revision
      && goal.phase === 'active' && goal.activation === 'disarmed' && goal.roundsStarted < goal.maxGoalRounds
  }

  idle(agent: RetryAgent): void {
    const entry = this.current(agent)
    const candidate = entry?.candidate
    if (entry === undefined || candidate === undefined || entry.timer !== undefined) return
    if (!this.valid(entry, candidate)) { this.stop(entry, 'ineligible'); return }
    if (entry.view.attempts >= entry.view.maxRetries) { this.stop(entry, 'exhausted'); this.report(entry); return }
    entry.view.status = 'waiting'
    entry.view.nextAt = Date.now() + entry.view.intervalSeconds * 1000
    this.report(entry)
    entry.timer = setTimeout(() => { void this.recover(entry, candidate) }, entry.view.intervalSeconds * 1000)
  }

  private async recover(entry: Entry, candidate: Candidate): Promise<void> {
    const epoch = entry.epoch
    try {
      await entry.agent.whenIdle()
      if (!this.valid(entry, candidate)) return
      if (!await this.services.flush(entry.agent)) throw new Error('No durable checkpoint')
      // Recheck after every asynchronous boundary; resume is synchronous and CAS-protected.
      if (!this.valid(entry, candidate) || entry.view.attempts >= entry.view.maxRetries) return
      ++entry.view.attempts
      entry.ownResume = true
      this.services.resume(entry.agent, { id: entry.goalId, revision: candidate.revision })
      this.stop(entry, 'resumed')
      this.report(entry)
    } catch {
      if (entry.epoch === epoch) { this.stop(entry, 'failed'); entry.view.enabled = false; entry.restore(); this.report(entry) }
    } finally {
      entry.ownResume = false
      if (entry.epoch === epoch) this.stop(entry, 'ineligible')
    }
  }

  private report(entry: Entry): void {
    this.services.log(`Goal retry ${entry.goalId}: ${entry.view.status}; attempts ${entry.view.attempts}/${entry.view.maxRetries}; code ${entry.view.code}; next ${entry.view.nextAt}`)
  }

  dispose(): void {
    this.disposed = true
    for (const entry of this.entries.values()) { this.stop(entry); entry.restore() }
    this.entries.clear()
  }
}
