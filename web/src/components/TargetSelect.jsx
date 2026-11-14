import { bodyLabel } from '../lib/format.js'

/** Target-site dropdown (the Moon/Mars reference). With `body` it lists that world only; otherwise grouped by world. */
export default function TargetSelect({ id, label = 'Target site', targets, body, value, onChange }) {
  const visible = body ? targets.filter((t) => t.body === body) : targets
  const groups = body ? [[body, visible]] : ['moon', 'mars'].map((b) => [b, visible.filter((t) => t.body === b)])

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        {/* Once a site is chosen the placeholder cannot be re-selected (it would blank the page). */}
        {!value && <option value="">Choose a target site…</option>}
        {groups.map(([b, list]) =>
          body ? (
            list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))
          ) : (
            <optgroup key={b} label={bodyLabel(b)}>
              {list.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
    </div>
  )
}
