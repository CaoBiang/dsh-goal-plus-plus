import type { Context } from '@deepseek-ai/cordis'
import { GOAL_RETRY_ROUTE, retryRecord, retryRequestSchema } from '../shared/goalRetry'
import { GoalRetryEngine, type RetryAgent, type RetryGoal } from './goalRetryEngine'

interface Host {
  get(name: string): unknown
  on(name: string, listener: (...args: unknown[]) => unknown, options?: { prepend: boolean }): () => void
  logger: { info(message: string): void }
}
interface Agents { get(id: string): RetryAgent | undefined }
interface Goals { get(agent: RetryAgent): RetryGoal | undefined; resume(agent: RetryAgent, ref: { id: string; revision: number }): unknown }
interface Sessions { flush(session: RetryAgent['session']): Promise<boolean> }
interface Routes { register(route: { path: string; methods: string[]; requestBody: 'buffered'; fetch(request: Request): Promise<Response> }): () => void }

/** Optional Host-only recovery; a missing native seam leaves the rest of Goal++ unchanged. */
export function watchGoalRetry(ctx: Context): void {
  ctx.inject(['agents', 'goals', 'sessions', 'connection'], (c) => {
    const host = c as unknown as Host
    const disposers: (() => void)[] = []
    let engine: GoalRetryEngine | undefined
    try {
      const agents = retryRecord(host.get('agents'))
      const goals = retryRecord(host.get('goals'))
      const sessions = retryRecord(host.get('sessions'))
      const routes = retryRecord(retryRecord(host.get('connection')).fetch)
      if (typeof agents.get !== 'function' || typeof goals.get !== 'function' || typeof goals.resume !== 'function'
        || typeof goals.disarm !== 'function' || typeof sessions.flush !== 'function' || typeof routes.register !== 'function') return
      const agentFace = agents as unknown as Agents
      const goalFace = goals as unknown as Goals
      const sessionFace = sessions as unknown as Sessions
      const service = new GoalRetryEngine({
        agent: id => agentFace.get(id), goal: agent => goalFace.get(agent),
        resume: (agent, ref) => goalFace.resume(agent, ref), flush: agent => sessionFace.flush(agent.session),
        log: (message) => { host.logger.info(message) },
      })
      engine = service
      const on = (name: string, fn: (...args: unknown[]) => void) => {
        disposers.push(host.on(name, (...args) => {
          try { fn(...args) } catch { /* Malformed events never interrupt the harness bus. */ }
        }))
      }
      const agentOf = (payload: unknown): RetryAgent => retryRecord(payload).agent as RetryAgent
      on('goal/changed', (payload) => { service.changed(agentOf(payload)) })
      on('agent/disposed', (payload) => { service.changed(agentOf(payload)) })
      on('agent/inbox/inserted', (payload) => { service.activity(agentOf(payload)) })
      on('agent/error', (payload) => { service.error(agentOf(payload), payload) })
      on('agent/status', (payload) => {
        if (retryRecord(payload).status === 'idle') service.idle(agentOf(payload))
        else service.activity(agentOf(payload))
      })
      on('session/event', (session, event) => {
        const id = retryRecord(session).id
        if (typeof id !== 'string') return
        const agent = agentFace.get(id)
        if (agent !== undefined && agent.session === session) service.sessionEvent(agent, event)
      })
      disposers.push(host.on('agent/request-error', async (payload, next) => {
        const delegate = next as () => Promise<unknown>
        const outcome: { called: boolean; result?: unknown; thrown?: unknown; failed: boolean } = { called: false, failed: false }
        try {
          return await service.requestError(agentOf(payload), payload, async () => {
            outcome.called = true
            try { outcome.result = await delegate(); return outcome.result }
            catch (error) { outcome.failed = true; outcome.thrown = error; throw error }
          })
        } catch {
          if (!outcome.called) return delegate()
          if (outcome.failed) throw outcome.thrown
          return outcome.result
        }
      }, { prepend: true }))
      disposers.push((routes as unknown as Routes).register({
        path: GOAL_RETRY_ROUTE, methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
          try {
            const input = retryRequestSchema.parse(await request.json())
            return Response.json({ ok: true, value: service.control(input) }, { headers: { 'cache-control': 'no-store' } })
          } catch {
            return Response.json({ ok: false }, { status: 409, headers: { 'cache-control': 'no-store' } })
          }
        },
      }))
    } catch { /* Missing or incompatible services do not arm recovery. */ }
    const dispose = () => { for (const off of disposers.reverse()) off(); engine?.dispose() }
    return dispose
  })
}
