import { useSyncExternalStore } from 'react'
import { asRecord, type ClientCtx } from './services'

export interface GoalRef { id: string; revision: number }
export interface GoalControlFace {
  get?: (sessionId: string) => Promise<unknown>
  pause(sessionId: string, ref: GoalRef): Promise<unknown>
  resume(sessionId: string, ref: GoalRef): Promise<unknown>
  subscribe(sessionId: string, refresh: () => void): () => void
}

let face: GoalControlFace | undefined
const listeners = new Set<() => void>()
function publish(next: GoalControlFace | undefined): void {
  face = next
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function snapshot(): GoalControlFace | undefined { return face }
export function useGoalControlFace(): GoalControlFace | undefined {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Resolve traced Remote namespaces only inside their declared optional fiber. */
export function watchGoalControl(ctx: ClientCtx): void {
  ctx.inject(['remote', 'remote.goals'], (c) => {
    try {
      const remote = asRecord((c as ClientCtx & { remote?: unknown }).remote)
      const goals = asRecord(remote?.goals)
      if (goals === null || typeof goals.pause !== 'function'
        || typeof goals.resume !== 'function' || typeof remote?.$on !== 'function') return
      const on = (remote.$on as (event: string, listener: (value: unknown) => void) => () => void).bind(remote)
      publish({
        ...(typeof goals.get === 'function' ? { get: (goals.get as NonNullable<GoalControlFace['get']>).bind(goals) } : {}),
        pause: (goals.pause as GoalControlFace['pause']).bind(goals),
        resume: (goals.resume as GoalControlFace['resume']).bind(goals),
        subscribe(sessionId, refresh) {
          const off = on('goal/activation-changed', (event: unknown) => {
            try { if (asRecord(event)?.sessionId === sessionId) refresh() } catch { /* Drop hostile events. */ }
          })
          try {
            const reset = (c as unknown as { on(event: string, listener: () => void): () => void }).on('connection/reset', refresh)
            return () => { off(); reset() }
          } catch (error) { off(); throw error }
        },
      })
    } catch { publish(undefined) }
    return () => { publish(undefined) }
  })
}

/** Malformed and unsuccessful replies never become a successful control state. */
export function goalControlValue(reply: unknown): Record<string, unknown> {
  const result = asRecord(reply)
  if (result?.ok !== true) throw new Error('Goal control failed')
  const value = asRecord(result.value)
  if (value === null) throw new Error('Goal control unavailable')
  return value
}

export async function boundedGoalRequest(request: () => Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request(),
      new Promise((_, reject) => { timer = setTimeout(() => { reject(new Error('Goal control timeout')) }, 15_000) }),
    ])
  } finally { clearTimeout(timer) }
}
