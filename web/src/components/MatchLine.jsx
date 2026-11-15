import { pct } from '../lib/format.js'
import { ClippedTag, EvidenceTag, SourceTag } from './Tags.jsx'

/**
 * One comparison claim tied to its data: "Criterion: value here vs the target's value
 * (xx% similar)" plus the evidence type behind the Earth value. `row` is a lib/mirror.js
 * mirrorRows() row; values without provenance (mock / seed bundles) keep their source label.
 */
export default function MatchLine({ row, site, target }) {
  const { feature, sim } = row
  return (
    <>
      <strong>{feature.label}:</strong> {row.site.text ?? '—'}{' '}
      {!row.site.status && <SourceTag source={site.sources?.[feature.id]} />}
      <span className="muted"> here vs the target’s </span>
      {row.target.text ?? '—'} {!row.target.status && <SourceTag source={target.refs?.[feature.id]} />}
      <ClippedTag direction={row.target.clipped} />{' '}
      {sim !== null && <span className="match-line__sim">({pct(sim)} similar)</span>}{' '}
      <EvidenceTag status={row.site.status} />
    </>
  )
}
