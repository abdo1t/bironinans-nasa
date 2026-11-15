import { entrySummary } from '../lib/summary.js'
import { WHY_MIN_SIM } from '../lib/scoring.js'

/**
 * One-line "why it ranks here": ✓ closest match · ✗ largest shortfall, from a
 * ranking entry's precomputed why/gap. For an unscored site it shows the reason.
 * Symbols are decorative; screen readers get the words.
 */
export default function WhyGap({ entry, className = '' }) {
  const s = entrySummary(entry)
  if (!s.scored) return <span className={`why-gap why-gap--none ${className}`.trim()}>{s.short || 'Data pending'}</span>
  return (
    <span className={`why-gap ${className}`.trim()}>
      {s.match && (
        <span className="why-gap__match">
          <span aria-hidden="true">✓ </span>
          <span className="sr-only">Closest match: </span>
          {s.match}
        </span>
      )}
      {s.short && (
        <span className="why-gap__short">
          <span aria-hidden="true">✗ </span>
          <span className="sr-only">Largest shortfall: </span>
          {s.short}
        </span>
      )}
      {!s.match && !s.short && (
        <span className="muted">No criterion reaches {Math.round(WHY_MIN_SIM * 100)}% similarity</span>
      )}
    </span>
  )
}
