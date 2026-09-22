import { asRecord, type SessionStandardProps } from './services'

export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'
export interface GoalState {
  id: string
  objective: string
  phase: GoalPhase
  revision: number | null
  roundsStarted: number | null
  maxGoalRounds: number | null
  createdAt: number | null
  updatedAt: number | null
  blockedReason: string | null
}
export type GoalDetection =
  | { kind: 'unavailable' | 'empty' | 'invalid' }
  | { kind: 'ready'; goal: GoalState }

function count(value: unknown, minimum: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : null
}

/** The durable goal projection excludes process-local continuation activation. */
export function goalOf(value: unknown): GoalDetection {
  if (value === undefined) return { kind: 'unavailable' }
  if (value === null) return { kind: 'empty' }
  try {
    const data = asRecord(value)
    const goal = asRecord(data?.goal)
    if (data === null || goal === null) return { kind: 'invalid' }
    const { id, objective, phase } = goal
    if (typeof id !== 'string' || id.trim() === ''
      || typeof objective !== 'string' || objective.trim() === ''
      || (phase !== 'active' && phase !== 'paused' && phase !== 'blocked' && phase !== 'complete')) {
      return { kind: 'invalid' }
    }
    const reason = asRecord(goal.blockedReason)
    const message = reason?.message
    return { kind: 'ready', goal: {
      id, objective, phase,
      revision: count(goal.revision, 1),
      roundsStarted: count(data.roundsStarted, 0),
      maxGoalRounds: count(goal.maxGoalRounds, 1),
      createdAt: count(data.createdAt, 0),
      updatedAt: count(data.updatedAt, 0),
      blockedReason: typeof message === 'string' && message.trim() !== '' ? message : null,
    } }
  } catch {
    return { kind: 'invalid' }
  }
}

/** Called unconditionally during render: the standard projection seat is a hook. */
export function useGoalDetection(props: SessionStandardProps): GoalDetection {
  try {
    return goalOf(props.useProjection?.('goal'))
  } catch {
    return { kind: 'invalid' }
  }
}
