import { MISSIONS, missionTitle } from '../lib/missions.js'
import { mirrorRows, mirrorTakeaway } from '../lib/mirror.js'
import { bodyLabel } from '../lib/format.js'

const pct = (sim) => `${Math.round(sim * 100)}%`

/** Where a value comes from: the bundle's provenance, linked when it carries a URL. */
function SourceLink({ desc }) {
  const p = desc?.provenance
  if (!p) return <span>not recorded</span>
  const label = p.dataset || p.citation || 'source'
  const short = label.length > 60 ? `${label.slice(0, 57)}…` : label
  return p.url ? (
    <a href={p.url} target="_blank" rel="noreferrer" title={label}>
      {short}
      <span className="sr-only"> (opens in new tab)</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : (
    <span title={label}>{short}</span>
  )
}

/** One compared criterion: Earth value vs reference value, the similarity, and both sources. */
function Row({ kind, row, world, siteName, targetName }) {
  return (
    <div className={`mtake__row mtake__row--${kind}`}>
      <p className="mtake__label">
        <span aria-hidden="true">{kind === 'match' ? '✓' : '✗'} </span>
        {kind === 'match' ? 'Measured match' : 'Important difference'}: <strong>{row.feature.label}</strong>{' '}
        <span className="mtake__sim">{pct(row.sim)} similar</span>
        {row.target.clipped && (
          <span className="mtake__src">
            Near Earth’s extreme: the target is beyond Earth’s range ({row.target.clipped}), so no Earth place can match it
            fully.
          </span>
        )}
      </p>
      <dl className="mtake__vals">
        <div>
          <dt>Earth · {siteName}</dt>
          <dd>
            {row.site.text ?? 'no data'}
            <span className="mtake__src">
              Source: <SourceLink desc={row.site} />
            </span>
          </dd>
        </div>
        <div>
          <dt>
            {world} · {targetName}
          </dt>
          <dd>
            {row.target.text ?? 'no data'}
            <span className="mtake__src">
              Source: <SourceLink desc={row.target} />
            </span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Planetary Mirror takeaway for Site details: under the 2D terrain pair, one measured match and one
 * important difference (scored similarities, same 70% threshold as "What matches"), then what the
 * selected research objective could test here and the one field measurement still needed.
 * Display only; scoped to resemblance, never mission suitability.
 */
export default function MirrorTakeaway({ target, site, weights, features, presetId, isCustom, scored }) {
  const rows = mirrorRows(target, site, weights, features)
  const { match, differ, siteMissing } = mirrorTakeaway(rows)
  const mission = MISSIONS[isCustom ? 'balanced' : presetId] || MISSIONS.balanced
  const world = bodyLabel(target.body)
  const targetName = target.name.split(' — ')[0]
  const objective = isCustom ? 'Custom weights' : missionTitle(presetId)
  const needed = siteMissing[0]

  return (
    <section className="mc-panel mtake" aria-labelledby="mtake-title">
      <header className="mc-panel__head">
        <h2 id="mtake-title">Planetary Mirror · what the comparison shows</h2>
      </header>
      <div className="mc-panel__body">
        <div className="mtake__pair">
          {match ? (
            <Row kind="match" row={match} world={world} siteName={site.name} targetName={targetName} />
          ) : (
            <p className="mtake__none">No selected criterion is at least 70% similar here.</p>
          )}
          {differ ? (
            <Row kind="differ" row={differ} world={world} siteName={site.name} targetName={targetName} />
          ) : (
            <p className="mtake__none">No selected criterion with data is under 70% similar.</p>
          )}
        </div>

        <div className="mtake__next">
          <div>
            <h3>What could we test here?</h3>
            {scored && match ? (
              <p>
                <span className="mtake__obj">{objective}:</span> {mission.fieldTest}{' '}
                <span className="muted">
                  Supported here by the {match.feature.label.toLowerCase()} match — a lead to check, not a confirmed
                  test site.
                </span>
              </p>
            ) : (
              <p className="muted">Not enough measured similarity to suggest a test at this place.</p>
            )}
          </div>
          <div>
            <h3>Field measurement still needed</h3>
            <p>
              {needed ? (
                <>
                  <strong>{needed.feature.label}</strong> at {site.name}: no value in this dataset, so it is left out
                  of the score.
                </>
              ) : (
                mission.fieldMeasure
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
