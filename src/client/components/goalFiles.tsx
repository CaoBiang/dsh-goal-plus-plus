import type { ReactElement } from 'react'
import type { ClientCtx, SessionStandardProps } from '../services'
import type { ViewKit } from '../viewkit'
import { useTimelineSource } from '../timelineSource'
import { goalFilesOf } from '../goalFiles'

export function makeGoalFiles(ctx: ClientCtx, { t, fmt }: ViewKit) {
  return function GoalFiles(props: SessionStandardProps & { goalId: string }): ReactElement {
    const { data, detailState, retryDetail } = useTimelineSource(ctx, props)
    const files = goalFilesOf(data?.fileOps, props.goalId)
    return <section className="lc-card gp-files">
      <h2>{t('goal.files')}</h2>
      {detailState === 'failed' ? <button type="button" onClick={retryDetail}>{t('goal.filesRetry')}</button>
        : detailState === 'loading' ? <p className="lc-foot">{t('goal.filesLoading')}</p>
          : files.length === 0 ? <p className="lc-foot">{t('goal.filesEmpty')}</p>
            : <ul className="gp-file-list">{files.map(file => <li key={file.path}>
              <span className="gp-file-path">{file.path}</span>
              <span className="gp-file-delta" aria-label={t('goal.filesDelta', { added: fmt(file.added), removed: fmt(file.removed) })}>
                <span className="gp-file-added">+{fmt(file.added)}</span>
                <span className="gp-file-removed">−{fmt(file.removed)}</span>
              </span>
            </li>)}</ul>}
      {data?.fileOpsFloor !== undefined && <p className="lc-foot">{t('goal.filesPartial')}</p>}
      <p className="lc-foot">{t('goal.filesHint')}</p>
    </section>
  }
}
