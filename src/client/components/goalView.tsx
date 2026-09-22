import type { ComponentType, ReactElement } from 'react'
import { useGoalDetection } from '../goal'
import type { SessionStandardProps } from '../services'
import type { ViewKit } from '../viewkit'
import { makeGoalCharts } from './goalCharts'
import { makeGoalControl } from './goalControl'

export function makeGoalView(
  kit: ViewKit, Tokens: ComponentType<SessionStandardProps & { goalId: string }>,
): (props: SessionStandardProps) => ReactElement {
  const { t } = kit
  const GoalCharts = makeGoalCharts(kit)
  const GoalControl = makeGoalControl(kit)
  const date = (value: number | null): string => value === null || !Number.isFinite(new Date(value).getTime())
    ? '—' : new Date(value).toLocaleString()
  return function GoalView(props: SessionStandardProps): ReactElement {
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
          <div className="lc-card-title">
            <h2>{t('goal.title')}</h2>
            <span className="gp-status" data-phase={goal.phase} role="status">{t('goal.phase.' + goal.phase)}</span>
          </div>
          <p className="gp-objective">{goal.objective}</p>
          <GoalControl sessionId={props.sessionId} goal={goal} key={JSON.stringify([props.sessionId, goal.id, goal.revision])} />
          {goal.phase === 'blocked' && <div className="gp-blocked">
            <strong>{t('goal.blockedReason')}</strong>
            <p>{goal.blockedReason ?? t('goal.reasonUnknown')}</p>
          </div>}
        </section>
        <Tokens {...props} goalId={goal.id} key={goal.id} />
        <GoalCharts goal={goal} />
        <details className="lc-card gp-details">
          <summary>{t('goal.details')}</summary>
          <dl className="gp-facts">
            {fields.map(([key, value]) => <div key={key}><dt>{t('goal.' + key)}</dt><dd>{value}</dd></div>)}
          </dl>
          <p className="lc-foot">{t('goal.durableHint')}</p>
        </details>
      </div>
    )
  }
}
