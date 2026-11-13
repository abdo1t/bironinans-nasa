const BLURB = {
  moon: 'Polar ice traps, basalt maria and lava tubes.',
  mars: 'Ancient lake deltas, layered sediments and buried ice.',
}

export default function WorldCard({ body, label, count, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`world-card world-card--${body}${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(body)}
    >
      <span className={`world-card__orb world-card__orb--${body}`} aria-hidden="true" />
      <span className="world-card__name">{label}</span>
      <span className="world-card__blurb">{BLURB[body]}</span>
      <span className="world-card__count">{count} candidate base sites</span>
    </button>
  )
}
