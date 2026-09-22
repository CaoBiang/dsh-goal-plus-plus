import { useMemo } from 'react'
import type { GoalState } from '../goal'
import { goalFilesOf } from '../goalFiles'
import { goalAgentsOf } from '../goalAgents'
import { goalTokensOf } from '../goalTokens'
import { fmtDurationCompact, sessionsFaceOf } from '../agentTree'
import { useSessionsSnapshot } from '../agentHeads'
import { useTimelineSource } from '../timelineSource'
import type { ClientCtx, SessionStandardProps } from '../services'
import type { ViewKit } from '../viewkit'

export type GoalDashboardProps = SessionStandardProps & { goal: GoalState }

export function makeGoalDashboard(ctx: ClientCtx, { t, fmt }: ViewKit) {
  return function GoalDashboard(props: GoalDashboardProps) {
    const { goal } = props
    const { data, detailState, retryDetail } = useTimelineSource(ctx, props)
    const executionMs = goalTokensOf(data?.goalUsage, goal.id)?.executionMs
    const elapsed = executionMs === undefined ? '—' : fmtDurationCompact(executionMs)
    const files = useMemo(() => goalFilesOf(data?.fileOps, goal.id), [data?.fileOps, goal.id])
    const totals = files.reduce((sum, file) => ({
      added: Math.min(Number.MAX_SAFE_INTEGER, sum.added + file.added),
      removed: Math.min(Number.MAX_SAFE_INTEGER, sum.removed + file.removed),
    }), { added: 0, removed: 0 })
    const fileReady = data !== null && detailState !== 'failed' && detailState !== 'loading'
    const changed = totals.added + totals.removed
    const face = useMemo(() => sessionsFaceOf(ctx), [])
    const snapshot = useSessionsSnapshot(face)
    const agents = useMemo(() => goalAgentsOf(snapshot, props.sessionId), [snapshot, props.sessionId])
    const running = agents?.filter(agent => agent.running).length ?? 0
    return <div className="gp-dashboard" role="group" aria-label={t('goal.dashboard.title')}>
      <div className="gp-dashboard-grid">
        <div className="gp-dashboard-cell" title={t('goal.dashboard.elapsedHint')}>
          <span className="gp-dashboard-label">{t('goal.dashboard.elapsed')}</span>
          <div className="gp-dashboard-body">
            <svg className="gp-dashboard-icon" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" /><path d="M20 10v11l7 4" /></svg>
            <div><strong>{elapsed}</strong></div>
          </div>
        </div>
        <div className="gp-dashboard-cell" data-phase={goal.phase}>
          <span className="gp-dashboard-label">{t('goal.dashboard.status')}</span>
          <div className="gp-dashboard-body">
            <svg className="gp-dashboard-phase" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" />
              <path d={({ active: 'M17 13l10 7-10 7Z', paused: 'M16 13v14M24 13v14', blocked: 'M20 11v12M20 27v2', complete: 'M12 20l6 6 11-12' })[goal.phase]} />
            </svg>
            <div><strong>{t('goal.phase.' + goal.phase)}</strong><small>{t('goal.dashboard.rounds', { n: goal.roundsStarted === null ? '—' : fmt(goal.roundsStarted) })}</small></div>
          </div>
        </div>
        <div className="gp-dashboard-cell gp-dashboard-code" title={t('goal.dashboard.codeHint')}>
          <span className="gp-dashboard-label">{t('goal.dashboard.code')}</span>
          <div>
            <strong className="gp-file-delta"><span className="gp-file-added">+{fileReady ? fmt(totals.added) : '—'}</span><span className="gp-file-removed">−{fileReady ? fmt(totals.removed) : '—'}</span></strong>
            <div className="gp-dashboard-bar" aria-hidden="true"><i style={{ width: `${fileReady && changed > 0 ? totals.added / changed * 100 : 0}%` }} /><i style={{ width: `${fileReady && changed > 0 ? totals.removed / changed * 100 : 0}%` }} /></div>
            {detailState === 'failed' ? <button type="button" className="lc-gran-btn gp-action" onClick={retryDetail}>{t('error.retry')}</button>
              : data?.fileOpsFloor !== undefined && <small>{t('goal.filesPartialShort')}</small>}
          </div>
        </div>
        <div className="gp-dashboard-cell" title={t('goal.dashboard.agentsHint')}>
          <span className="gp-dashboard-label">{t('goal.dashboard.agents')}</span>
          <div><strong>{agents === null ? '—' : fmt(running)}</strong><small>{t('goal.dashboard.agentTotal', { n: agents === null ? '—' : fmt(agents.length) })}</small></div>
        </div>
      </div>
    </div>
  }
}
