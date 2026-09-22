import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientCtx, SessionStandardProps } from '../services'
import type { ViewKit } from '../viewkit'
import { useTimelineSource } from '../timelineSource'
import { goalFilesOf } from '../goalFiles'
import { useEscapeClose } from './escapeClose'

const PAGE_SIZE = 10

export function makeGoalFiles(ctx: ClientCtx, { t, fmt }: ViewKit) {
  return function GoalFiles(props: SessionStandardProps & { goalId: string }): ReactElement {
    const { data, detailState, retryDetail } = useTimelineSource(ctx, props)
    const files = goalFilesOf(data?.fileOps, props.goalId)
    const [open, setOpen] = useState(false)
    const [page, setPage] = useState(0)
    const close = () => { setOpen(false) }
    useEscapeClose(open, close)
    useEffect(() => { setOpen(false); setPage(0) }, [props.sessionId, props.goalId])
    const pages = Math.max(1, Math.ceil(files.length / PAGE_SIZE))
    const currentPage = Math.min(page, pages - 1)
    const totals = files.reduce((sum, file) => ({
      added: Math.min(Number.MAX_SAFE_INTEGER, sum.added + file.added),
      removed: Math.min(Number.MAX_SAFE_INTEGER, sum.removed + file.removed),
    }), { added: 0, removed: 0 })
    const delta = (added: number, removed: number) => <span className="gp-file-delta" aria-label={t('goal.filesDelta', { added: fmt(added), removed: fmt(removed) })}>
      <span className="gp-file-added">+{fmt(added)}</span><span className="gp-file-removed">−{fmt(removed)}</span>
    </span>
    return <section className="lc-card gp-files">
      <div className="gp-files-overview">
        <h2>{t('goal.files')}</h2>
        {detailState === 'failed' ? <button type="button" className="lc-gran-btn gp-action" onClick={retryDetail}>{t('goal.filesRetry')}</button>
          : detailState === 'loading' ? <p className="lc-foot">{t('goal.filesLoading')}</p>
            : files.length === 0 ? <p className="lc-foot">{t('goal.filesEmpty')}</p>
              : <><span>{t('goal.filesCount', { n: fmt(files.length) })}</span>{delta(totals.added, totals.removed)}
                <button type="button" className="lc-gran-btn gp-action" onClick={() => { setPage(0); setOpen(true) }}>{t('goal.filesView')}</button></>}
        {data?.fileOpsFloor !== undefined && <span className="lc-foot" title={t('goal.filesPartial')}>{t('goal.filesPartialShort')}</span>}
      </div>
      <Modal open={open} onClose={close} title={t('goal.files')} headless className="gp-files-modal">
        <header className="gp-files-heading">
          <h2>{t('goal.files')}</h2>
          <button type="button" className="lc-gran-btn gp-action gp-action-icon" aria-label={t('goal.filesClose')} onClick={close}>×</button>
        </header>
        <div className="gp-files-content">
          <p className="gp-files-summary">{t('goal.filesCount', { n: fmt(files.length) })} · {delta(totals.added, totals.removed)}</p>
          <ul className="gp-file-list">{files.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(file => <li key={file.path}>
            <span className="gp-file-path">{file.path}</span>
            {delta(file.added, file.removed)}
          </li>)}</ul>
          {data?.fileOpsFloor !== undefined && <p className="lc-foot">{t('goal.filesPartial')}</p>}
        </div>
        <nav className="gp-files-pager" aria-label={t('goal.filesPager')}>
          <button type="button" className="lc-gran-btn gp-action" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1) }}>{t('ov.list.prev')}</button>
          <span role="status">{t('ov.list.page', { n: currentPage + 1, total: pages })}</span>
          <button type="button" className="lc-gran-btn gp-action" disabled={currentPage === pages - 1} onClick={() => { setPage(currentPage + 1) }}>{t('ov.list.next')}</button>
        </nav>
      </Modal>
    </section>
  }
}
