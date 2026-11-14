const BLURB = {
  moon: 'Polar ice traps, basalt maria and lava tubes.',
  mars: 'Ancient lake deltas, layered sediments and buried ice.',
}

/** "1 target site" / "3 target sites" — how many Moon/Mars reference sites the bundle holds for this world. */
function countText(count) {
  if (!count) return 'No target sites yet'
  return `${count} target site${count === 1 ? '' : 's'}`
}

/**
 * One world (Moon or Mars) as a toggle button. The planet is CSS-only art (styles/home.css).
 * Selected state: aria-pressed for assistive tech plus a visible "✓ Selected" label,
 * so it never depends on the border colour alone.
 */
export default function WorldCard({ body, label, count, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`world-card world-card--${body}${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      disabled={!count}
      onClick={() => onSelect(body)}
    >
      <span className={`world-card__orb world-card__orb--${body}`} aria-hidden="true" />
      <span className="world-card__name">{label}</span>
      <span className="world-card__blurb">{BLURB[body]}</span>
      <span className="world-card__foot">
        <span className="world-card__count">{countText(count)}</span>
        {/* aria-pressed already announces the state; the label is the visible equivalent */}
        {selected && (
          <span className="world-card__picked" aria-hidden="true">
            ✓ Selected
          </span>
        )}
      </span>
    </button>
  )
}
