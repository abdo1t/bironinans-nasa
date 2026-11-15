import '../styles/ranking.css'
import { useMemo, useRef, useState } from 'react'
import { useFlip } from '../lib/useFlip.js'
import { useBundle } from '../data/useBundle.js'
import { pct } from '../lib/format.js'
import { missionTitle } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { biggestMovers, explainScoreChange, rankShift, rankWith, signed, weightChanges } from '../lib/rankShift.js'
import { useAppState } from '../state/AppState.jsx'

function Move({ s }) {
  if (!s || s.status === 'none' || s.status === 'same') {
    return (
      <span className="lrank__move">
        <span aria-hidden="true">–</span>
        <span className="sr-only">unchanged</span>
      </span>
    )
  }
  if (s.status === 'entered') return <span className="lrank__move is-up">new</span>
  const up = s.delta > 0
  return (
    <span className={`lrank__move ${up ? 'is-up' : 'is-down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(s.delta)}
      <span className="sr-only">
        {' '}
        {up ? 'up' : 'down'} from rank {s.prevRank}
      </span>
    </span>
  )
}

/** Plain-language reason a place moved: each changed weight, re-scored alone with the real engine. */
function MoveReason({ site, shift, explain, baseLabel }) {
  if (!site || !explain) return null
  const items = explain.items.filter((i) => i.effect !== 0 || !i.siteHasData)
  return (
    <div className="lrank__why">
      <p className="lrank__why-head">
        <strong>{site.name}</strong>{' '}
        {shift?.prevRank && shift?.rank ? (
          <>
            #{shift.prevRank} → #{shift.rank}
          </>
        ) : shift?.rank ? (
          <>now #{shift.rank}</>
        ) : (
          <>not scored</>
        )}
        {explain.total !== null && (
          <span className="muted">
            {' '}
            · score {explain.baseScore} → {explain.score} ({signed(explain.total)})
          </span>
        )}
      </p>
      {items.length ? (
        <ul className="lrank__why-list">
          {items.slice(0, 4).map((i) => (
            <li key={i.id}>
              <span className="lrank__why-crit">
                {i.label} {i.from}→{i.to}
              </span>
              {i.siteHasData ? (
                <>
                  <span className={`lrank__why-eff${i.effect > 0 ? ' is-up' : i.effect < 0 ? ' is-down' : ''}`}>
                    {i.effect === null ? 'no score' : `${signed(i.effect)} pts`}
                  </span>
                  <span className="lrank__why-sim">match here {pct(i.sim)}</span>
                </>
              ) : (
                <span className="lrank__why-sim lrank__why-sim--na">no data here — this weight cannot affect it</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="lrank__why-none">Its own score did not change; it moved because other places’ scores did.</p>
      )}
      {shift?.delta > 0 && explain.total !== null && explain.total <= 0 && (
        <p className="lrank__why-none">
          It moved up although its own score did not rise: places above it lost more points or are no longer scored.
        </p>
      )}
      {shift?.delta < 0 && explain.total !== null && explain.total >= 0 && (
        <p className="lrank__why-none">
          It moved down although its own score did not fall: other places gained more points.
        </p>
      )}
      <p className="lrank__why-note">
        Compared with {baseLabel}. Each weight change is re-scored on its own with the same scoring engine; changes
        interact, so the parts need not add up exactly. Rank also depends on how the other places moved.
      </p>
    </div>
  )
}

/**
 * Live ranking beside the research-priority sliders. Every number comes from the app's single
 * scoring engine (AppState ranking = scoring.js rankSites + orderRanking); the comparison
 * ranking is the same function with other weights. Shows previous → current rank, the score
 * change, which weight changes moved a place, and animates the reorder.
 *
 * Baseline: "objective" = the mission's default weights; "last" = the weights before the most
 * recent change.
 */
export default function LiveRanking({ limit = 5, className = '' }) {
  const { data } = useBundle()
  const app = useAppState()
  const [baseline, setBaseline] = useState('objective')
  const [showAll, setShowAll] = useState(false)
  const [picked, setPicked] = useState(null)
  const listRef = useRef(null)

  // Weights before the most recent change (React's "state from the previous render" pattern).
  const wKey = `${data.features.map((f) => app.weights[f.id] || 0).join('-')}|${app.targetId}|${app.rankBy}`
  const [hist, setHist] = useState({ key: wKey, prev: null, cur: app.weights })
  if (hist.key !== wKey) setHist({ key: wKey, prev: hist.cur, cur: app.weights })

  const baseId = app.isCustom ? app.basePresetId : app.presetId
  const baseWeights = baseline === 'last' && hist.prev ? hist.prev : PRESETS[baseId]?.weights || app.weights
  const baseLabel = baseline === 'last' && hist.prev ? 'your previous setting' : `the ${missionTitle(baseId)} defaults`

  const baseRanking = useMemo(
    () => rankWith(app.target, data.sites, baseWeights, data.features, data.minCriteria, app.rankBy, data.siteById),
    [app.target, baseWeights, app.rankBy, data],
  )
  const shift = useMemo(() => rankShift(baseRanking, app.ranking), [baseRanking, app.ranking])
  const changes = weightChanges(baseWeights, app.weights, data.features)
  const movers = biggestMovers(shift, 1)

  const scored = app.ranking.filter((r) => r.score !== null)
  const shown = showAll ? scored : scored.slice(0, limit)
  useFlip(listRef, shown.map((r) => r.site).join(','))

  const focusId = (picked && shift[picked]?.rank ? picked : null) || movers[0]?.site || null
  const focusSite = focusId ? data.siteById[focusId] : null
  const explain = useMemo(
    () =>
      focusSite && app.target && changes.length
        ? explainScoreChange(app.target, focusSite, baseWeights, app.weights, data.features, data.minCriteria)
        : null,
    // changes is derived from baseWeights + app.weights
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusSite, baseWeights, app.weights, app.target, data],
  )

  if (!app.target) return null
  const baseLeader = baseRanking.find((r) => r.rank === 1)?.site
  const dropped = Object.keys(shift).filter((id) => shift[id].status === 'dropped')
  const leaderChanged =changes.length > 0 && scored[0] && baseLeader && baseLeader !== scored[0].site

  return (
    <section className={`lrank ${className}`} aria-labelledby="lrank-title">
      <header className="lrank__head">
        <h3 id="lrank-title" className="lrank__title">
          Live ranking
          <span className="lrank__engine">same scoring engine as the results</span>
        </h3>
        <div className="seg seg--tiny" role="group" aria-label="Compare the ranking with">
          <button type="button" aria-pressed={baseline === 'objective'} onClick={() => setBaseline('objective')}>
            vs objective
          </button>
          <button
            type="button"
            aria-pressed={baseline === 'last'}
            disabled={!hist.prev}
            title={hist.prev ? undefined : 'Change a weight first'}
            onClick={() => setBaseline('last')}
          >
            vs last change
          </button>
        </div>
      </header>

      {changes.length ? (
        <p className="lrank__changes">
          <span className="muted">Changed vs {baseLabel}:</span>{' '}
          {changes.map((c) => (
            <span key={c.id} className="lrank__chip">
              {c.label} {c.from}→{c.to}
            </span>
          ))}
        </p>
      ) : (
        <p className="lrank__changes muted">Showing {baseLabel}. Move a slider and watch places move.</p>
      )}

      {leaderChanged && (
        <p className="lrank__leader" role="status">
          New best match: <strong>{data.siteById[scored[0].site].name}</strong> (was #
          {shift[scored[0].site]?.prevRank ?? '–'}) — the recommendation depends on the research priorities.
        </p>
      )}

      {scored.length ? (
        <ol className="lrank__list" ref={listRef}>
          {shown.map((r) => {
            const s = shift[r.site]
            const site = data.siteById[r.site]
            const isFocus = focusId === r.site && changes.length > 0
            return (
              <li key={r.site} data-flip-id={r.site} data-rank={r.rank} className={`lrank__row${isFocus ? ' is-focus' : ''}`}>
                <button
                  type="button"
                  className="lrank__btn"
                  aria-pressed={isFocus}
                  onClick={() => setPicked(r.site)}
                  title="Explain this place’s movement"
                >
                  <span className="lrank__rank">{r.rank}</span>
                  <span className="lrank__name">
                    <span className="lrank__name-text">{site.name}</span>
                    {s?.prevRank && s.prevRank !== r.rank && <span className="lrank__was">was #{s.prevRank}</span>}
                  </span>
                  <span className="lrank__bar" aria-hidden="true">
                    <span style={{ width: `${app.rankBy === 'min' ? (r.scoreRange?.[0] ?? r.score) : r.score}%` }} />
                  </span>
                  <span
                    className="lrank__score"
                    title={app.rankBy === 'min' ? `Conservative lower bound; similarity ${r.score}` : 'Similarity score'}
                  >
                    {app.rankBy === 'min' ? `≥${r.scoreRange?.[0] ?? r.score}` : r.score}
                    {(() => {
                      // the change of the number actually shown (score, or lower bound when ordered by it)
                      const d = app.rankBy === 'min' ? s?.minDelta : s?.scoreDelta
                      return d ? <span className={`lrank__sd${d > 0 ? ' is-up' : ' is-down'}`}>{signed(d)}</span> : null
                    })()}
                  </span>
                  <Move s={s} />
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="hint">No place can be scored with these priorities — give weight to criteria that have data.</p>
      )}

      {dropped.length > 0 && (
        <p className="lrank__dropped" role="note">
          <span aria-hidden="true">◐ </span>
          <strong>No longer scored:</strong> {dropped.map((id) => `${data.siteById[id].name} (was #${shift[id].prevRank})`).join(', ')}.
          Fewer than {data.minCriteria} of the weighted criteria have data there — missing data is left out, not counted as a
          poor match.
        </p>
      )}

      {scored.length > limit && (
        <button type="button" className="link-btn lrank__more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show top ${limit}` : `Show all ${scored.length} scored places`}
        </button>
      )}

      {changes.length > 0 && <MoveReason site={focusSite} shift={shift[focusId]} explain={explain} baseLabel={baseLabel} />}
    </section>
  )
}
