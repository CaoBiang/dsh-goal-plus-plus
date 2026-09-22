import { useEffect, useRef, useState } from 'react'
import type { GoalState } from '../goal'
import { boundedGoalRequest, goalControlValue, useGoalControlFace } from '../goalControl'
import type { ViewKit } from '../viewkit'

export function makeGoalControl({ t }: ViewKit) {
  return function GoalControl({ sessionId, goal }: { sessionId?: string; goal: GoalState }) {
    const face = useGoalControlFace()
    const [activation, setActivation] = useState<'armed' | 'disarmed' | 'unknown'>()
    const [error, setError] = useState(false)
    const [pending, setPending] = useState(false)
    const [retry, setRetry] = useState(0)
    const busy = useRef(false)
    const epoch = useRef(0)
    const generation = useRef(0)
    const available = face !== undefined && !!sessionId && goal.revision !== null
    useEffect(() => {
      setActivation(undefined)
      setError(false)
      setPending(false)
      busy.current = false
      if (!available) return
      const get = face.get
      if (get === undefined) {
        setActivation('unknown')
        return () => { ++generation.current }
      }
      let disposed = false
      const refresh = () => {
        const read = ++epoch.current
        setActivation(undefined)
        void boundedGoalRequest(() => get(sessionId)).then((reply) => {
          if (disposed || read !== epoch.current) return
          const value = goalControlValue(reply)
          if (value.id !== goal.id || value.revision !== goal.revision
            || (value.activation !== 'armed' && value.activation !== 'disarmed')) throw new Error('Invalid goal activation')
          setActivation(value.activation)
          setError(false)
        }).catch(() => { if (!disposed && read === epoch.current) setError(true) })
      }
      let off: (() => void) | undefined
      try { off = face.subscribe(sessionId, refresh); refresh() } catch { setError(true) }
      return () => { disposed = true; ++epoch.current; ++generation.current; off?.() }
    }, [face, sessionId, goal.id, goal.revision, available, retry])

    if (goal.phase === 'complete') return null
    const action = goal.phase === 'active' && activation !== 'disarmed' ? 'pause' : 'resume'
    const capped = goal.roundsStarted !== null && goal.maxGoalRounds !== null
      && goal.roundsStarted >= goal.maxGoalRounds
    const run = async (verb: 'pause' | 'resume') => {
      if (busy.current || face === undefined || sessionId === undefined || goal.revision === null) return
      busy.current = true
      setPending(true)
      setError(false)
      const request = generation.current
      const ref = { id: goal.id, revision: goal.revision }
      try {
        const reply = await boundedGoalRequest(() => face[verb](sessionId, ref))
        goalControlValue(reply)
      } catch { if (request === generation.current) setError(true) }
      finally {
        if (request === generation.current) {
          busy.current = false
          setPending(false)
        }
      }
    }
    return <div className="gp-control">
      <button type="button" className="lc-gran-btn" disabled={!available || activation === undefined || pending || (action === 'resume' && capped)}
        onClick={() => { void run(action) }}>{t(pending ? 'goal.controlPending' : 'goal.' + action)}</button>
      {activation === 'unknown' && goal.phase === 'active' && <button type="button" className="lc-gran-btn"
        disabled={pending || capped} onClick={() => { void run('resume') }}>{t('goal.resume')}</button>}
      {!available && <span className="lc-foot">{t('goal.controlUnavailable')}</span>}
      {available && !error && activation === undefined && <span className="lc-foot">{t('goal.controlLoading')}</span>}
      {capped && <span className="lc-foot">{t('goal.capReached')}</span>}
      {error && <span role="alert">{t('goal.controlError')} <button type="button" className="lc-gran-btn"
        disabled={pending} onClick={() => { setRetry(value => value + 1) }}>{t('goal.controlRetry')}</button></span>}
    </div>
  }
}
