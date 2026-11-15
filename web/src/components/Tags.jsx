import { SCORE_RANGE_HELP, evidenceCoverage, linkifyCitation, scoreRangeText } from '../lib/explain.js'
import { NO_SCORE_COLOR, evidenceInfo, scoreColor, sourceKind } from '../lib/format.js'

/** Evidence type of a real value (Reanalysis, In-situ, Literature, ...). */
export function EvidenceTag({ status }) {
  const e = evidenceInfo(status)
  if (!e) return null
  const cls = e.unknown ? 'other' : String(status).replace(/[^a-z-]/gi, '')
  return (
    <span className={`tag tag--evidence tag--ev-${cls}`} title={e.title}>
      {e.label}
    </span>
  )
}

/** Shown when a target value lies beyond Earth's range and was clipped to the bound. */
export function ClippedTag({ direction }) {
  if (!direction) return null
  const text = direction === 'below' ? 'colder/lower than anywhere on Earth' : 'beyond Earth’s maximum'
  return (
    <span className="tag tag--clipped" title={`Target value is ${text}; similarity measures how close a site comes to Earth's extreme.`}>
      Beyond Earth range
    </span>
  )
}

/**
 * Evidence: High / Medium / Low — share of the selected WEIGHT whose criteria have data
 * on both sides (see evidenceCoverage in lib/explain.js).
 */
export function EvidenceCoverageTag({ target, site, weights, features }) {
  if (!target || !site) return null
  const ev = evidenceCoverage(target, site, weights, features)
  if (!ev.level) return null
  const label = { high: 'High', medium: 'Medium', low: 'Low' }[ev.level]
  return (
    <span
      className={`tag tag--conf tag--conf-${ev.level}`}
      title={
        `Evidence coverage: ${ev.usedWeight} of ${ev.selectedWeight} selected weight points ` +
        `(${ev.used} of ${ev.selected} criteria) have data for both the site and the target. ` +
        'High: at least 80 %. Low: under 50 % or fewer than 3 criteria. ' +
        'It says how much of the score rests on data, not how accurate the data are.'
      }
    >
      Evidence: {label}
    </span>
  )
}

/** "· range 49–77" beside a score; nothing when missing data cannot move it. */
export function ScoreRange({ score, range }) {
  const text = scoreRangeText(score, range)
  if (!text) return null
  return (
    <span className="score-range" title={SCORE_RANGE_HELP}>
      {' '}
      · {text}
      <span className="sr-only"> (possible range, depending on missing data)</span>
    </span>
  )
}

/** Citation text with URLs and doi:10.xxxx/... turned into links. */
export function CitationText({ text }) {
  if (!text) return null
  return (
    <>
      {linkifyCitation(text).map((seg, i) =>
        seg.href ? (
          <a key={i} href={seg.href} target="_blank" rel="noreferrer">
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

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

/** Catalogued analog vs uncatalogued candidate (far from every catalogued analog — NOT a validated analog). */
export function NoveltyTag({ site }) {
  if (site.isNewCandidate) {
    return (
      <span
        className="tag tag--uncatalogued"
        title={`Not in this project's analog reference catalogue: the nearest catalogued analog is ${site.novelKm} km away. A lead for field checking — not a validated analog.`}
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
      {used} of {selected} measured
      <span className="sr-only">{partial ? ' — some data pending' : ''}</span>
    </span>
  )
}

export function ScoreBadge({ score, large = false }) {
  if (score === null || score === undefined) {
    return (
      <span className={`score-badge score-badge--none${large ? ' score-badge--large' : ''}`}>
        <span className="swatch swatch--hollow" style={{ borderColor: NO_SCORE_COLOR }} aria-hidden="true" />
        No score — insufficient data
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
    return <span className="score-bar__none">No score — insufficient data</span>
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
