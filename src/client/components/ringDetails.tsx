import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition } from '@deepseek-ai/dsh-client-ui-primitives'

export function RingDetails({ title, children, details, info = false }: {
  title: string
  children: ReactNode
  details: ReactNode
  info?: boolean
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const id = useId()
  const cancel = useCallback(() =>{  clearTimeout(timer.current) }, [])
  const close = useCallback(() => { cancel(); setOpen(false) }, [cancel])
  const show = () => { cancel(); setOpen(true) }
  const leave = () => { cancel(); timer.current = setTimeout(close, 150) }
  useEffect(() => cancel, [cancel])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () =>{  window.removeEventListener('keydown', onKey) }
  }, [open, close])
  const position = useAnchoredPosition({ open, anchorRef, panelRef, gap: 6, margin: 12 })
  return <div className={info ? 'gp-info-wrap' : 'gp-ring-wrap'}>
    <button ref={anchorRef} type="button" className="gp-ring-trigger" aria-label={title} aria-expanded={open}
      aria-controls={open ? id : undefined} onMouseEnter={show} onMouseLeave={leave}
      onFocus={show} onBlur={close} onClick={show}>{children}</button>
    {open && createPortal(<div ref={panelRef} id={id} role="region" aria-label={title}
      className="gp-ring-details" style={position ?? undefined} onMouseEnter={show} onMouseLeave={leave}>
      <div className="lc-card-title">{title}</div>{details}
    </div>, document.body)}
  </div>
}
