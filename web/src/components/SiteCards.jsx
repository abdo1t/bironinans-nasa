import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { scoreColor } from '../lib/format.js'
import { entrySummary } from '../lib/summary.js'
import { CoverageBadge, EvidenceCoverageTag, NoveltyTag } from './Tags.jsx'
import WhyGap from './WhyGap.jsx'

/**
 * Ranked recommendation cards beside the map: the keyboard- and screen-reader-friendly
 * twin of the map markers (same order, same rank numbers, same status labels).
 * `active` = { id, source } is the site highlighted on both; a marker click scrolls its
 * card into view, hovering or focusing a card highlights its marker.
 */
export default function SiteCards({
  ranking,
  siteById,
  target,
  weights,
  features,
  shortlist,
  shortlistFull,
  onToggleShortlist,
  linkTo,
  rankBy,
  active,
  onActive,
  selectedId,
  onSelect,
}) {
  const refs = useRef({})
  const boxRef = useRef(null)

  // A place chosen on the map is brought into view inside this list's own scroller only,
  // so the page itself never jumps.
  useEffect(() => {
    if (active?.source !== 'map' || !selectedId) return
    const el = refs.current[selectedId]
    const box = boxRef.current
    if (!el || !box || box.scrollHeight <= box.clientHeight) return
    const top = el.offsetTop // .site-cards is the offsetParent (position: relative)
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: Math.max(top - 8, 0), behavior: 'auto' })
    }
  }, [active, selectedId])

  // Ranking-change feedback: after the objective, weights or order change, each card says how
  // many places it moved (kept until the next change). A new target starts afresh.
  const prevRanks = useRef({ targetId: null, ranks: null })
  const [moves, setMoves] = useState({})
  const rankKey = `${target.id}|${ranking.map((r) => `${r.site}:${r.rank}`).join(',')}`
  useEffect(() => {
    const now = Object.fromEntries(ranking.map((r) => [r.site, r.rank]))
    const prev = prevRanks.current
    prevRanks.current = { targetId: target.id, ranks: now }
    if (!prev.ranks || prev.targetId !== target.id) {
      setMoves({})
      return
    }
    const next = {}
    for (const [id, rank] of Object.entries(now)) {
      if (rank && prev.ranks[id] && prev.ranks[id] !== rank) next[id] = prev.ranks[id] - rank
    }
    setMoves(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankKey])

  const scored = ranking.filter((r) => r.score !== null)
  const unscored = ranking.filter((r) => r.score === null)

  const card = (r) => {
    const site = siteById[r.site]
    const s = entrySummary(r)
    const listed = shortlist.includes(site.id)
    const isActive = active?.id === site.id
    const isSelected = selectedId === site.id
    return (
      <li
        key={site.id}
        ref={(el) => {
          refs.current[site.id] = el
        }}
        className={`site-card${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}${listed ? ' is-listed' : ''}${s.scored ? '' : ' site-card--none'}`}
        onMouseEnter={() => onActive(site.id, 'list')}
        onMouseLeave={() => onActive(null, 'list')}
        onFocus={() => onActive(site.id, 'list')}
      >
        <div className="site-card__head">
          <span className="site-card__rank" style={{ '--pin': scoreColor(r.score) }} aria-hidden="true">
            {r.rank ?? '–'}
          </span>
          <div className="site-card__id">
            <h3 className="site-card__name">
              <button
                type="button"
                className="site-card__select"
                aria-pressed={isSelected}
                onClick={() => onSelect(site.id, 'list')}
              >
                <span className="sr-only">{r.rank ? `Rank ${r.rank}: ` : 'Not ranked: '}</span>
                {site.name}
                <span className="sr-only">{isSelected ? ' (selected, shown in the analysis panel)' : ' — show on map and analyse'}</span>
              </button>
            </h3>
            <span className="site-card__country">
              {site.country}
              {moves[site.id] ? (
                <span className={`site-card__move site-card__move--${moves[site.id] > 0 ? 'up' : 'down'}`}>
                  <span aria-hidden="true">{moves[site.id] > 0 ? '▲' : '▼'} </span>
                  {moves[site.id] > 0 ? 'up' : 'down'} {Math.abs(moves[site.id])}
                  <span className="sr-only"> {Math.abs(moves[site.id]) === 1 ? 'place' : 'places'} after your change</span>
                </span>
              ) : null}
            </span>
          </div>
          <div className="site-card__score">
            {s.scored ? (
              <>
                <span className="site-card__num">
                  <span className="sr-only">Score </span>
                  {s.score}
                  <span className="site-card__max">/100</span>
                </span>
                {s.hasRange ? (
                  <span className="site-card__range">
                    <span className="sr-only">possible range: </span>could be{' '}
                    <span className={rankBy === 'min' ? 'site-card__lo is-key' : 'site-card__lo'}>
                      {s.min}
                      <span className="sr-only"> (guaranteed minimum)</span>
                    </span>
                    –{s.max}
                  </span>
                ) : (
                  // Closed range: nothing is missing on the site side. Criteria missing on the
                  // target side (e.g. no verified target value) cannot move the score either.
                  <span className="site-card__range site-card__range--full">
                    {r.coverage.used === r.coverage.selected ? 'no data gaps' : 'no missing site data'}
                  </span>
                )}
              </>
            ) : (
              <span className="site-card__noscore">No score</span>
            )}
          </div>
        </div>

        <p className="site-card__meta">
          {s.scored && <EvidenceCoverageTag target={target} site={site} weights={weights} features={features} />}
          <CoverageBadge coverage={r.coverage} />
          <NoveltyTag site={site} />
        </p>

        <p className="site-card__why">
          <WhyGap entry={r} />
        </p>

        <div className="site-card__actions">
          <Link className="btn btn--small" to={linkTo(`/site/${site.id}`)}>
            Details<span className="sr-only"> for {site.name}</span>
          </Link>
          <button
            type="button"
            className={`btn btn--small${listed ? ' is-on' : ''}`}
            aria-pressed={listed}
            disabled={!listed && shortlistFull}
            title={!listed && shortlistFull ? 'You can compare up to 3 sites' : undefined}
            onClick={() => onToggleShortlist(site.id)}
          >
            {listed ? '✓ In compare' : shortlistFull ? 'Compare full (3)' : '+ Compare'}
            <span className="sr-only"> {site.name}</span>
          </button>
          {s.scored && (
            <Link className="btn btn--small btn--ghost" to={linkTo('/mirror', { site: site.id })}>
              Mirror<span className="sr-only">: see {site.name} beside {target.name}</span>
            </Link>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="site-cards" ref={boxRef}>
      <ol className="site-cards__list" aria-label={`Earth sites ranked for ${target.name}`}>
        {scored.map(card)}
      </ol>
      {unscored.length > 0 && (
        <>
          <h3 className="site-cards__sub">Not scored — insufficient evidence</h3>
          <ul className="site-cards__list" aria-label="Sites without a score">
            {unscored.map(card)}
          </ul>
        </>
      )}
    </div>
  )
}
