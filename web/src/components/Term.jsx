import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { GLOSSARY } from '../lib/glossary.js'

const GAP = 6 // px between the button and the tooltip
const EDGE = 8 // px kept free at the viewport edge

/**
 * A term with a short plain-language definition behind a "?" button.
 * Opens on hover, keyboard focus or tap; Escape, blur, a tap elsewhere or scrolling
 * closes it, and so does moving the pointer away (it may rest on the tooltip itself).
 * The tooltip is position: fixed so tables, popups and scroll containers cannot clip it.
 *
 *   <Term id="evidence">Evidence</Term>          label + "?"
 *   <Term id="evidence" />                       "?" only (label is elsewhere)
 */
export default function Term({ id, children }) {
  const entry = GLOSSARY[id]
  const tipId = useId()
  const btnRef = useRef(null)
  const tipRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)

  const closeTimer = useRef(null)
  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), [])
  const close = useCallback(() => {
    cancelClose()
    setOpen(false)
  }, [cancelClose])
  // Hover leaves get a short grace period so the pointer can cross the gap onto the tooltip.
  const closeSoon = useCallback(() => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }, [cancelClose])
  const show = useCallback(() => {
    cancelClose()
    setOpen(true)
  }, [cancelClose])
  useEffect(() => cancelClose, [cancelClose])

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !tipRef.current) return
    const b = btnRef.current.getBoundingClientRect()
    const t = tipRef.current.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    let left = b.left + b.width / 2 - t.width / 2
    left = Math.max(EDGE, Math.min(left, vw - t.width - EDGE))
    let top = b.bottom + GAP
    if (top + t.height > vh - EDGE && b.top - GAP - t.height > EDGE) top = b.top - GAP - t.height
    setPos({ left, top })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && close()
    // Touch devices do not blur a tapped button, so a tap elsewhere must close it.
    const onPointer = (e) => !btnRef.current?.contains(e.target) && close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  if (!entry) return children ?? null

  return (
    <span className="term" onMouseEnter={show} onMouseLeave={closeSoon}>
      {children}
      <button
        ref={btnRef}
        type="button"
        className="term__btn"
        aria-label={`What is “${entry.title}”?`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onFocus={show}
        onBlur={close}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // Focus/hover already opened it; a click or tap only ever opens (never toggles shut).
          show()
        }}
      >
        ?
      </button>
      {open && (
        <span
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className="term__tip"
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
        >
          <strong className="term__tip-title">{entry.title}</strong>
          {entry.text}
        </span>
      )}
    </span>
  )
}
