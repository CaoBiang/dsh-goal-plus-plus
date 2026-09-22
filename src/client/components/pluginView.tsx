import { createElement as h, useSyncExternalStore, type ComponentType, type ReactElement } from 'react'
import type { ClientCtx, ContextViewProps } from '../services'
import type { ViewKit } from '../viewkit'
import { goalPageOf, selectGoalPage, subscribeContextFocus } from '../viewFocus'
import { makeGoalTokens } from './goalTokens'
import { makeGoalView } from './goalView'

export function makePluginView(
  kit: ViewKit, ContextView: ComponentType<ContextViewProps>, ctx: ClientCtx,
): (props: ContextViewProps) => ReactElement {
  const GoalView = makeGoalView(kit, makeGoalTokens(ctx, kit))
  const { t } = kit
  function Pages(props: ContextViewProps): ReactElement {
    const sessionId = props.sessionId ?? ''
    const page = useSyncExternalStore(subscribeContextFocus, () => goalPageOf(sessionId))
    return (
      <div className="lc-root gp-shell">
        <header className="gp-header">
          <strong>Goal++</strong>
          <nav className="lc-gran" aria-label={t('pages.label')}>
            {(['goal', 'context'] as const).map(key => <button
              type="button" key={key} aria-pressed={page === key}
              className={'lc-gran-btn' + (page === key ? ' lc-gran-on' : '')}
              onClick={() => { selectGoalPage(sessionId, key) }}
            >{t('pages.' + key)}</button>)}
          </nav>
        </header>
        <div className="gp-page">{page === 'goal' ? <GoalView {...props} /> : <ContextView {...props} />}</div>
      </div>
    )
  }
  return function PluginView(props: ContextViewProps): ReactElement {
    return h(Pages, { ...props, key: props.sessionId })
  }
}
