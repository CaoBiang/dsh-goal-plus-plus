import { useState, type ReactElement } from 'react'
import type { GoalPhase, GoalState } from '../goal'
import type { ViewKit } from '../viewkit'
import { makeDonut } from './donut'

const PHASES: readonly GoalPhase[] = ['active', 'paused', 'blocked', 'complete']
const COLORS = {
  active: 'var(--color-blue-500)', paused: 'var(--color-amber-500)',
  blocked: 'var(--color-red-500)', complete: 'var(--color-teal-500)',
}
const REMAINING = 'var(--color-slate-400)'

/** At most 40 bins: a large host cap must not allocate one DOM node per round. */
export function roundBudgetOf(goal: GoalState) {
  const { roundsStarted: started, maxGoalRounds: limit } = goal
  if (started === null || limit === null || started > limit) return null
  const remaining = limit - started
  const count = Math.min(limit, 40)
  const size = Math.floor(limit / count)
  const remainder = limit % count
  const boundary = (index: number) => index * size + Math.floor(index * remainder / count)
  const bins = Array.from({ length: count }, (_, index) => {
    const first = boundary(index) + 1
    const last = boundary(index + 1)
    const used = Math.max(0, Math.min(started, last) - first + 1)
    return { first, last, used, share: used / (last - first + 1) }
  })
  return { started, limit, remaining, percent: (started / limit * 100).toFixed(1), bins }
}

export function makeGoalCharts(kit: ViewKit): (props: { goal: GoalState }) => ReactElement {
  const { t, fmt } = kit
  const Donut = makeDonut(kit)
  return function GoalCharts({ goal }: { goal: GoalState }): ReactElement {
    const [hoverKey, setHoverKey] = useState<string | null>(null)
    const budget = roundBudgetOf(goal)
    const color = COLORS[goal.phase]
    const segments = budget === null ? [] : [
      { key: 'started', color, value: budget.started },
      { key: 'remaining', color: REMAINING, value: budget.remaining },
    ]
    return <>
      <dl className="gp-kpis">
        {([
          ['rounds', goal.roundsStarted ?? '—'],
          ['remaining', budget?.remaining ?? '—'],
          ['limit', goal.maxGoalRounds ?? '—'],
          ['roundShare', budget === null ? '—' : budget.percent + '%'],
        ] as const).map(([key, value]) => <div key={key} className="lc-stat"><dt>{t('goal.' + key)}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="gp-charts">
        <section className="lc-card gp-state-card">
          <h2 className="lc-card-title">{t('goal.stateChart')}</h2>
          <div className="gp-state-map" role="img" aria-label={t('goal.stateSummary', { phase: t('goal.phase.' + goal.phase) })}>
            <svg viewBox="0 0 360 200" aria-hidden="true" className="gp-state-lines">
              {PHASES.map((phase, index) => <path key={phase}
                d={`M180 100 L${index % 2 === 0 ? 70 : 290} ${index < 2 ? 32 : 168}`}
                style={{ stroke: phase === goal.phase ? COLORS[phase] : REMAINING }}
                strokeWidth={phase === goal.phase ? 3 : 1} strokeDasharray={phase === goal.phase ? undefined : '4 5'} />)}
            </svg>
            {PHASES.map(phase => <div key={phase} className={'gp-phase-node gp-phase-' + phase}
              data-current={phase === goal.phase} style={{ borderColor: COLORS[phase] }}>
              <span className="gp-dot" style={{ background: COLORS[phase] }} />{t('goal.phase.' + phase)}
              {phase === goal.phase && <small>{t('goal.currentState')}</small>}
            </div>)}
            <div className="gp-state-center" style={{ borderColor: color }}><b>{t('pages.goal')}</b><span>{t('goal.phase.' + goal.phase)}</span></div>
          </div>
          <p className="lc-foot">{t('goal.phaseHint.' + goal.phase)}</p>
          <p className="lc-foot">{t('goal.stateChartHint')}</p>
        </section>
        <section className="lc-card">
          <h2 className="lc-card-title">{t('goal.budgetChart')}</h2>
          <div className="gp-budget-body">
            <div role="img" aria-label={budget === null ? t('goal.budgetUnknown') : t('goal.budgetSummary', { started: budget.started, remaining: budget.remaining, limit: budget.limit })}>
              <Donut segments={segments}
                centerTop={budget === null ? '—' : budget.percent + '%'} centerSub={t('goal.roundShare')}
                size={152} hoverKey={hoverKey} onHoverKey={setHoverKey} />
            </div>
            <div className="gp-budget-legend">
              {segments.map(segment => <button type="button" key={segment.key}
                className="gp-legend-row" onMouseEnter={() => { setHoverKey(segment.key) }}
                onMouseLeave={() => { setHoverKey(null) }}
                onFocus={() => { setHoverKey(segment.key) }} onBlur={() => { setHoverKey(null) }}>
                <span className="gp-dot" style={{ background: segment.color }} />
                <span>{t('goal.' + segment.key)}</span><b>{segment.value}</b>
              </button>)}
              <div className="gp-budget-total"><span>{t('goal.limit')}</span><b>{goal.maxGoalRounds ?? '—'}</b></div>
            </div>
          </div>
          <p className="lc-foot">{budget === null ? t('goal.budgetUnknown') : t('goal.roundsHint')}</p>
          {budget?.remaining === 0 && <p className="gp-cap-note">{t('goal.capReached')}</p>}
        </section>
      </div>
      <section className="lc-card">
        <h2 className="lc-card-title">{t('goal.roundChart')}</h2>
        {budget === null ? <p className="lc-foot">{t('goal.budgetUnknown')}</p> : <>
          <div className="gp-round-strip" role="img" aria-label={t('goal.budgetSummary', { started: budget.started, remaining: budget.remaining, limit: budget.limit })}>
            {budget.bins.map(bin => <div key={bin.first} className="gp-round-bin"
              title={t('goal.bin', { first: bin.first, last: bin.last, used: bin.used })}>
              <span style={{ height: `${bin.share * 100}%`, background: color }} />
            </div>)}
          </div>
          <div className="gp-round-axis"><span>1</span><span>{t('goal.roundPosition', { n: fmt(budget.started) })}</span><span>{fmt(budget.limit)}</span></div>
          <p className="lc-foot">{t('goal.roundChartHint')}</p>
        </>}
      </section>
    </>
  }
}
