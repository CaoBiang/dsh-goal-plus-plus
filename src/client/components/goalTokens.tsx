import { useState, type ReactElement } from 'react'
import type { ClientCtx, SessionStandardProps } from '../services'
import type { ViewKit } from '../viewkit'
import { useTimelineSource } from '../timelineSource'
import { goalFieldsOf, goalRoundsOf } from '../goalTokens'
import { headlineOf } from '../headline'
import { makeStatsTokens } from './statsTokens'
import { makeDonut } from './donut'
import { makeCurrentComposition } from './currentComposition'
import { makeLegend, makeStackedBar } from './stackedBar'
import { makeTrendChart } from './trendChart'

const noop = (): void => {}
export function makeGoalTokens(ctx: ClientCtx, kit: ViewKit): (props: SessionStandardProps & { goalId: string }) => ReactElement {
  const labels: Record<string, string> = {
    'tokens.title': 'goal.tokens', 'overview.title': 'goal.currentTokens', 'tip.turn1': 'goal.tokenRound',
  }
  const goalKit: ViewKit = { ...kit, t: (key, args) => kit.t(labels[key] ?? key, args) }
  const Stats = makeStatsTokens(goalKit, makeDonut(goalKit))
  const Current = makeCurrentComposition(goalKit, makeStackedBar(goalKit), makeLegend(goalKit))
  const Trend = makeTrendChart(goalKit)
  return function GoalTokens(props): ReactElement {
    const { data, detailState, retryDetail } = useTimelineSource(ctx, props)
    const [selected, setSelected] = useState<number | null>(null)
    const [hovered, setHovered] = useState<number | null>(null)
    const [category, setCategory] = useState<string | null>(null)
    const fields = goalFieldsOf((data ?? {}) as Record<string, unknown>)
    const usage = fields.goalUsage
    if (usage === undefined || usage.goalId !== props.goalId) return <section className="lc-card"><p className="lc-foot">{kit.t('goal.tokensWaiting')}</p></section>
    const rows = fields.goalRoundId === props.goalId ? goalRoundsOf(fields.goalRounds) : []
    const picked = rows.find(row => row.seq === (hovered ?? selected))
    const head = usage.current === null ? null : headlineOf({ ok: true, current: usage.current,
      requests: [], events: [], nodes: [], archive: [], droppedNodes: 0,
      contextWindow: usage.contextWindow ?? undefined,
      last: usage.anchor === null ? undefined : { ...usage.anchor, seq: 0 } })
    return <>
      <Stats usage={usage.usage} current={usage.composition} breakdown={null} />
      {head !== null && <Current head={head} subtitle={kit.t('goal.roundSpending', {
        t: usage.round, input: kit.fmt(usage.roundInput), output: kit.fmt(usage.roundOutput),
      })} hoverKey={category} onHoverKey={setCategory} />}
      <section className="lc-card">
        <div className="lc-card-title">{kit.t('goal.tokenTrend')}</div>
        {detailState === 'failed' ? <button type="button" onClick={retryDetail}>{kit.t('goal.tokensRetry')}</button>
          : rows.length === 0 ? <p className="lc-foot">{kit.t(detailState === 'loading' ? 'goal.tokensLoading' : 'goal.noRounds')}</p>
            : <Trend requests={rows} markers={[]} selectedSeq={selected} hoveredSeq={hovered} activeTurn={null}
              granularity="turn" mode="total" focusTurn={null} hoverCat={category}
              onSelect={setSelected} onHover={setHovered} onHoverTurn={noop} onPickTurn={noop} onFocusTurnHandled={noop} />}
        {picked !== undefined && <p className="lc-foot">{kit.t('goal.roundSpending', {
          t: picked.turn, input: kit.fmt(picked.billedInput), output: kit.fmt(picked.billedOutput),
        })}</p>}
        <p className="lc-foot">{kit.t('goal.tokensHint')}</p>
      </section>
    </>
  }
}
