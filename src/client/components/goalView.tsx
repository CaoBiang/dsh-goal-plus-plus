import { useState, type ComponentType, type ReactElement } from 'react'
import { useGoalDetection } from '../goal'
import type { SessionStandardProps } from '../services'
import type { ViewKit } from '../viewkit'
import { makeGoalControl } from './goalControl'
import { makeGoalRetry } from './goalRetry'
import { RingDetails } from './ringDetails'
import type { GoalDashboardProps } from './goalDashboard'

export function makeGoalView(
  kit: ViewKit, Tokens: ComponentType<SessionStandardProps & { goalId: string }>,
  Dashboard?: ComponentType<GoalDashboardProps>,
): (props: SessionStandardProps) => ReactElement {
  const { t } = kit
  const GoalControl = makeGoalControl(kit)
  const GoalRetry = makeGoalRetry(kit)
  const date = (value: number | null): string => value === null || !Number.isFinite(new Date(value).getTime())
    ? '—' : new Date(value).toLocaleString()
  return function GoalView(props: SessionStandardProps): ReactElement {
    const [retryTarget, setRetryTarget] = useState<HTMLDivElement | null>(null)
    const state = useGoalDetection(props)
    if (state.kind !== 'ready') return (
      <div className="lc-root gp-goal">
        <section className="lc-card">
          <h2 className="lc-card-title">{t('goal.title')}</h2>
          <p role="status">{t('goal.' + state.kind)}</p>
          {state.kind === 'empty' && <p className="lc-foot">{t('goal.start')}</p>}
        </section>
      </div>
    )
    const { goal } = state
    const fields = [
      ['created', date(goal.createdAt)],
      ['updated', date(goal.updatedAt)],
      ['id', goal.id],
      ['revision', goal.revision ?? '—'],
    ] as const
    return (
      <div className="lc-root gp-goal">
        <section className="lc-card">
          <div className="lc-card-title gp-goal-heading">
            <h2>{t('goal.title')}</h2>
            <RingDetails info title={t('goal.details')} details={
              <dl className="gp-facts">
                {fields.map(([key, value]) => <div key={key}><dt>{t('goal.' + key)}</dt><dd>{value}</dd></div>)}
              </dl>
            }>ⓘ</RingDetails>
            <span className="gp-status" data-phase={goal.phase} role="status">{t('goal.phase.' + goal.phase)}</span>
            <div className="gp-goal-actions">
              <GoalControl sessionId={props.sessionId} goal={goal} key={JSON.stringify([props.sessionId, goal.id])} />
              {props.sessionId && goal.revision !== null && goal.phase !== 'complete' && <GoalRetry sessionId={props.sessionId} goalId={goal.id} revision={goal.revision}
                detailsTarget={retryTarget}
                key={JSON.stringify(['retry', props.sessionId, goal.id])} />}
            </div>
          </div>
          <p className="gp-objective">{goal.objective}</p>
          {Dashboard && <Dashboard {...props} goal={goal} key={goal.id} />}
          {goal.phase === 'blocked' && <div className="gp-blocked">
            <strong>{t('goal.blockedReason')}</strong>
            <p>{goal.blockedReason ?? t('goal.reasonUnknown')}</p>
          </div>}
          <div ref={setRetryTarget} />
        </section>
        <Tokens {...props} goalId={goal.id} key={goal.id} />
      </div>
    )
  }
}
