import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GOAL_RETRY_ROUTE, RETRY_DEFAULTS, retryRecord, retrySettingsSchema, retryViewSchema, type RetryRequest, type RetryView } from '../../shared/goalRetry'
import type { ViewKit } from '../viewkit'
import { RingDetails } from './ringDetails'

export function makeGoalRetry({ t }: ViewKit) {
  return function GoalRetry({ sessionId, goalId, revision, detailsTarget }: {
    sessionId: string
    goalId: string
    revision: number
    detailsTarget?: HTMLElement | null
  }) {
    const [view, setView] = useState<RetryView>()
    const [error, setError] = useState(false)
    const [busy, setBusy] = useState(false)
    const [draft, setDraft] = useState(RETRY_DEFAULTS)
    const dirty = useRef(false)
    const [now, setNow] = useState(Date.now())
    const current = useRef<{ controller: AbortController; action: RetryRequest['action'] }>()
    const mounted = useRef(true)
    const revisionRef = useRef(revision)
    revisionRef.current = revision
    const request = async (action: RetryRequest['action'], settings?: RetryRequest['settings']) => {
      if (current.current !== undefined) {
        if (action === 'read' || current.current.action !== 'read') return
        current.current.controller.abort()
      }
      const controller = new AbortController()
      const requestRevision = revisionRef.current
      current.current = { controller, action }
      const isCurrent = () => current.current?.controller === controller
      if (action !== 'read') setBusy(true)
      const timeout = setTimeout(() => { controller.abort() }, 10_000)
      try {
        const response = await fetch(GOAL_RETRY_ROUTE, { method: 'POST', credentials: 'same-origin', signal: controller.signal,
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, goalId, revision: requestRevision, action, settings }) })
        const reply = retryRecord(await response.json())
        if (!response.ok || reply.ok !== true) throw new Error('Retry service unavailable')
        const value = retryViewSchema.parse(reply.value)
        if (mounted.current && isCurrent() && requestRevision === revisionRef.current) {
          setView(value); setError(false)
          if (action === 'configure') dirty.current = false
          if (!dirty.current) setDraft({ enabled: value.enabled, intervalSeconds: value.intervalSeconds, maxRetries: value.maxRetries })
        }
      } catch { if (mounted.current && isCurrent() && requestRevision === revisionRef.current) setError(true) }
      finally {
        clearTimeout(timeout)
        if (isCurrent()) {
          current.current = undefined
          if (mounted.current && action !== 'read') setBusy(false)
        }
      }
    }
    useEffect(() => {
      mounted.current = true
      void request('read')
      const timer = setInterval(() => { setNow(Date.now()); void request('read') }, 1000)
      return () => { mounted.current = false; clearInterval(timer); current.current?.controller.abort() }
    }, [])
    const valid = retrySettingsSchema.safeParse(draft).success
    const details = <>
      {view?.enabled && <div className="gp-retry-details">
        <form className="gp-retry-form" onSubmit={(event) => { event.preventDefault(); if (valid) void request('configure', draft) }}>
          <label className="gp-retry-field">{t('retry.interval')}<input type="number" min="1" max="2147483" step="1" required value={Number.isNaN(draft.intervalSeconds) ? '' : draft.intervalSeconds}
            onChange={(event) => { dirty.current = true; setDraft({ ...draft, intervalSeconds: event.target.valueAsNumber }) }} /></label>
          <label className="gp-retry-field">{t('retry.maximum')}<input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required value={Number.isNaN(draft.maxRetries) ? '' : draft.maxRetries}
            onChange={(event) => { dirty.current = true; setDraft({ ...draft, maxRetries: event.target.valueAsNumber }) }} /></label>
          <button type="submit" className="lc-gran-btn gp-action" disabled={!valid || busy}>{t('retry.save')}</button>
          {!valid && <p role="alert">{t('retry.invalid')}</p>}
        </form>
        <div className="gp-control">
          <RingDetails info title={t('retry.enabled')} details={t('retry.hint')}>ⓘ</RingDetails>
          <span role="status">{t('retry.' + view.status)} · {view.attempts}/{view.maxRetries}
            {view.nextAt !== null && ` · ${Math.max(0, Math.ceil((view.nextAt - now) / 1000))}s`}</span>
          {view.status === 'waiting' && <button type="button" className="lc-gran-btn gp-action" disabled={busy}
            onClick={() => { void request('cancel') }}>{t('retry.cancelRetry')}</button>}
        </div>
      </div>}
      {error && <p role="alert">{t('retry.error')}</p>}
    </>
    return <div className="gp-retry">
      <div className="gp-control">
        {view === undefined ? <span role="status">{t('retry.enabled')} · {t('goal.controlLoading')}</span> :
          <label><input type="checkbox" checked={view.enabled} disabled={busy}
            onChange={(event) => { void request('configure', { intervalSeconds: view.intervalSeconds, maxRetries: view.maxRetries, enabled: event.target.checked }) }} /> {t('retry.enabled')}</label>
        }
      </div>
      {detailsTarget ? createPortal(details, detailsTarget) : details}
    </div>
  }
}
