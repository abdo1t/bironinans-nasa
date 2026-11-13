import { bodyLabel } from '../lib/format.js'

/** Base-site dropdown. With `body` it lists that world only; otherwise grouped by world. */
export default function TargetSelect({ id, label = 'Base site', targets, body, value, onChange }) {
  const visible = body ? targets.filter((t) => t.body === body) : targets
  const groups = body ? [[body, visible]] : ['moon', 'mars'].map((b) => [b, visible.filter((t) => t.body === b)])

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Choose a base site…</option>
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
