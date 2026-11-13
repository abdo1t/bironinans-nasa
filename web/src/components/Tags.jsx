import { NO_SCORE_COLOR, scoreColor, sourceKind } from '../lib/format.js'

// Small status labels. Identity is always carried by text, never colour alone.

export function MockTag({ title = 'Synthetic placeholder value — not a measurement' }) {
  return (
    <span className="tag tag--mock" title={title}>
      MOCK
    </span>
  )
}

/** Label for where a value came from: MOCK, Unverified (seed class), or Data pending. */
export function SourceTag({ source }) {
  const kind = sourceKind(source)
  if (kind === 'none') return <span className="tag tag--pending">Data pending</span>
  if (kind === 'mock') return <MockTag title={source} />
  if (kind === 'seed') {
    return (
      <span className="tag tag--unverified" title={source}>
        Unverified
      </span>
    )
  }
  return null
}

/** Catalogued analog vs uncatalogued candidate (NOT a validated new analog). */
export function NoveltyTag({ site }) {
  if (site.isNewCandidate) {
    return (
      <span
        className="tag tag--uncatalogued"
        title={`Nearest catalogued analog is ${site.novelKm} km away. A lead for field validation — not a confirmed analog.`}
      >
        Uncatalogued candidate
      </span>
    )
  }
  return (
    <span className="tag tag--catalogued" title="Listed in, or near, the catalogue of known analog sites">
      {site.knownAnalog ? 'Catalogued analog' : 'Near catalogued analog'}
    </span>
  )
}

/** "6/7 criteria" — how many selected criteria actually had data on both sides. */
export function CoverageBadge({ coverage }) {
  if (!coverage) return null
  const { used, selected } = coverage
  const partial = used < selected
  return (
    <span
      className={`coverage${partial ? ' coverage--partial' : ''}`}
      title={`${used} of ${selected} selected criteria had data for this site and target`}
    >
      {used}/{selected} criteria
      <span className="sr-only">{partial ? ' — some data pending' : ''}</span>
    </span>
  )
}

export function ScoreBadge({ score, large = false }) {
  if (score === null || score === undefined) {
    return (
      <span className={`score-badge score-badge--none${large ? ' score-badge--large' : ''}`}>
        <span className="swatch swatch--hollow" style={{ borderColor: NO_SCORE_COLOR }} aria-hidden="true" />
        No score — data pending
      </span>
    )
  }
  return (
    <span className={`score-badge${large ? ' score-badge--large' : ''}`}>
      <span className="swatch" style={{ background: scoreColor(score) }} aria-hidden="true" />
      {score}
      <span className="score-badge__max">/100</span>
    </span>
  )
}

export function ScoreBar({ score }) {
  if (score === null || score === undefined) {
    return <span className="score-bar__none">No score — data pending</span>
  }
  return (
    <span className="score-bar" title={`Score ${score} of 100`}>
      <span className="score-bar__track" aria-hidden="true">
        <span className="score-bar__fill" style={{ width: `${score}%`, background: scoreColor(score) }} />
      </span>
      <span className="score-bar__value">{score}</span>
    </span>
  )
}
