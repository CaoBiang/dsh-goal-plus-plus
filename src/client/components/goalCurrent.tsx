import type { ViewKit } from '../viewkit'
import type { CurrentCompositionProps } from './currentComposition'
import { makeDonut, STATS_DONUT_SIZE } from './donut'
import { AUTO_COMPACT_RATIO, makeLegend } from './stackedBar'
import { RingDetails } from './ringDetails'

export function makeGoalCurrent(kit: ViewKit) {
  const { t, fmt } = kit
  const Donut = makeDonut(kit)
  const Legend = makeLegend(kit)
  return function GoalCurrent({ head, subtitle, hoverKey, onHoverKey }: CurrentCompositionProps) {
    const capacity = head.window ?? 0
    const free = Math.max(0, capacity - head.tokens)
    const segments = [...head.parts, { key: 'free', color: 'var(--dsw-alias-border-l2)', value: free }]
    return <section className="lc-card lc-col-donut" data-lc-current>
      <div className="lc-card-title"><span className="lc-card-title-text">{t('overview.title')}</span></div>
      <RingDetails title={t('overview.title')} details={<>
        <p className="lc-foot">{subtitle}</p>
        <div className="gp-current-legend">
          <div className="lc-overview-num"><b>{fmt(head.tokens)}</b><span>{capacity > 0 ? ` / ${fmt(capacity)} tokens` : ` ${t('overview.estimate')}`}</span></div>
          <Legend parts={head.parts} hoverKey={hoverKey} onHoverKey={onHoverKey} />
          {capacity > 0 && <p className="lc-foot" title={t('overview.compactReserve', { pct: Math.round(AUTO_COMPACT_RATIO * 100) })}>
            {t('overview.free')} · {fmt(free)}
          </p>}
        </div>
      </>}>
        <Donut size={STATS_DONUT_SIZE} segments={segments}
          centerTop={head.pct === null ? fmt(head.tokens) : `${head.pct}%`}
          centerSub={t(head.pct === null ? 'overview.estimate' : 'overview.used')}
          hoverKey={hoverKey} onHoverKey={onHoverKey} />
      </RingDetails>
    </section>
  }
}
