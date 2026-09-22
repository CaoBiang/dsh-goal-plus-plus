import { useEffect, useMemo, useState } from 'react'
import { useSessionsSnapshot } from '../agentHeads'
import { fmtDurationCompact, openAgentSession, sessionsFaceOf } from '../agentTree'
import { goalAgentsOf } from '../goalAgents'
import type { ClientCtx, SessionStandardProps } from '../services'
import type { ViewKit } from '../viewkit'

export function makeGoalAgents(ctx: ClientCtx, { t, fmt }: ViewKit) {
  return function GoalAgents({ sessionId }: SessionStandardProps) {
    const face = useMemo(() => sessionsFaceOf(ctx), [])
    const snapshot = useSessionsSnapshot(face)
    const agents = useMemo(() => goalAgentsOf(snapshot, sessionId), [snapshot, sessionId])
    const [attempt, setAttempt] = useState(0)
    const [failed, setFailed] = useState(false)
    const [active, setActive] = useState(true)
    const rows = agents?.filter(agent => agent.running === active) ?? []
    const title = t(active ? 'goal.agents.active' : 'goal.agents.inactive')
    useEffect(() => {
      let disposed = false
      setFailed(false)
      if (face === null || !sessionId || typeof face.refreshSubagents !== 'function') return
      const refresh = face.refreshSubagents.bind(face)
      void Promise.resolve().then(() => refresh(sessionId)).catch(() => {
        if (!disposed) setFailed(true)
      })
      return () => { disposed = true }
    }, [face, sessionId, attempt])
    return <section className="lc-card gp-agents">
      <h2 className="lc-card-title">{t('goal.agents.title')}</h2>
      {failed && <p role="status">{t('goal.agents.failed')} <button type="button" className="gp-action" onClick={() => { setAttempt(n => n + 1) }}>{t('error.retry')}</button></p>}
      {agents === null ? <p role="status">{t('goal.agents.unavailable')}</p> :
        <div>
          <div className="lc-gran gp-agent-filter" role="group" aria-label={t('goal.agents.filter')}>
            {([true, false] as const).map(running => <button type="button" key={String(running)}
              className={'lc-gran-btn' + (active === running ? ' lc-gran-on' : '')}
              aria-pressed={active === running} onClick={() => { setActive(running) }}
            >{t(running ? 'goal.agents.active' : 'goal.agents.inactive')} · {agents.filter(agent => agent.running === running).length}</button>)}
          </div>
          <section aria-label={title}>
            {rows.length === 0 ? <p className="lc-foot">{t('goal.agents.empty')}</p> : <ul className="gp-agent-list">
              {rows.map(agent => <li key={agent.id}>
                <div className="gp-agent-heading">
                  <button type="button" className="gp-agent-name" disabled={typeof face?.open !== 'function'} onClick={() => { openAgentSession(face, agent.id) }}>{agent.label}</button>
                  <span className="gp-status" data-phase={active ? 'active' : 'inactive'}>{t(active ? 'agents.running' : 'goal.agents.idle')}</span>
                </div>
                <p className="gp-agent-id">{agent.id}</p>
                <dl className="gp-agent-facts">
                  <div><dt>{t('goal.agents.mode')}</dt><dd>{agent.identity === null ? '—' : t(agent.identity.mode === 'one-shot' ? 'agents.oneshot' : 'agents.continuable')}</dd></div>
                  <div><dt>{t('goal.agents.duration')}</dt><dd>{agent.durationMs === null ? '—' : fmtDurationCompact(agent.durationMs)}</dd></div>
                  <div><dt>{t('goal.agents.tokens')}</dt><dd>{agent.head === null ? '—' : fmt(agent.head.tokens)}</dd></div>
                </dl>
              </li>)}
            </ul>}
          </section>
        </div>}
    </section>
  }
}
