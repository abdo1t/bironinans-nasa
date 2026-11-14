/**
 * Progressive disclosure: a styled native <details>. Keyboard and screen-reader
 * behaviour come from the element itself.
 *
 *   <Disclosure title="Scientific evidence" hint="values, units, sources">…</Disclosure>
 *
 * Uncontrolled by default (`defaultOpen`); pass `open` + `onToggle` to control it
 * (e.g. to mirror the state into the URL).
 */
export default function Disclosure({ title, hint, defaultOpen = false, open, onToggle, id, className = '', children }) {
  const controlled = open !== undefined
  return (
    <details
      id={id}
      className={`disclosure ${className}`.trim()}
      open={controlled ? open : defaultOpen || undefined}
      onToggle={onToggle ? (e) => onToggle(e.currentTarget.open) : undefined}
    >
      <summary className="disclosure__summary">
        <span className="disclosure__title">{title}</span>
        {hint && <span className="disclosure__hint">{hint}</span>}
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  )
}
