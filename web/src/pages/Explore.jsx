import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CriteriaPanel from '../components/CriteriaPanel.jsx'
import { IconList, IconMap } from '../components/Icons.jsx'
import MatchAnalysis from '../components/MatchAnalysis.jsx'
import MissionEvidence from '../components/MissionEvidence.jsx'
import MapView from '../components/MapView.jsx'
import ResultsList from '../components/ResultsList.jsx'
import ShortlistBar from '../components/ShortlistBar.jsx'
import SiteCards from '../components/SiteCards.jsx'
import TargetReference from '../components/TargetReference.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import TerrainPair from '../components/TerrainPair.jsx'
import Term from '../components/Term.jsx'
import { MockTag } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { availabilityNotice, dataAvailability } from '../lib/explain.js'
import { bodyLabel } from '../lib/format.js'
import { missionTitle } from '../lib/missions.js'
import { hasOpenRange } from '../lib/summary.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS } from '../lib/rankMethods.js'
import { matchScenario } from '../lib/scenarios.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/explore.css'

/** Value that only updates after `delay` ms of quiet (keeps screen-reader announcements off every slider step). */
function useDebounced(value, delay) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return settled
}

export default function Explore() {
  const { data } = useBundle()
  const app = useAppState()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'list' ? 'list' : 'map'
  // Research mode = Advanced options open (weights, ranking method, full evidence table).
  // Quick explore is the default; custom weights or adv=1 switch Research mode on.
  const advParam = params.get('adv')
  const advancedOpen = advParam === '1' || (advParam === null && app.isCustom)
  // Mission controls: hidden in Quick explore until "Change mission" (panel=1); always shown
  // in Research mode, where they hold the weights.
  const panelOpen = params.get('panel') === '1' || advancedOpen
  // Site hovered on the map or in the list, and the last "fly to" request.
  const [active, setActive] = useState({ id: null, source: null })
  const [focus, setFocus] = useState(null)

  const setParam = useCallback(
    (key, value) =>
      setParams(
        (prev) => {
          if ((prev.get(key) ?? null) === value) return prev
          const next = new URLSearchParams(prev)
          if (value === null) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const setView = (v) => setParam('view', v === 'map' ? null : v)
  const onAdvancedToggle = (open) => {
    if (open === advancedOpen) return
    setParam('adv', open ? '1' : app.isCustom ? '0' : null)
  }
  const closePanel = () => {
    setParam('panel', null)
    if (advancedOpen) onAdvancedToggle(false)
  }
  const onActive = useCallback((id, source) => setActive((a) => (a.id === id && a.source === source ? a : { id, source })), [])
  // Selecting a place (map marker or list card) drives the analysis panel and the terrain pair.
  const onSelect = useCallback(
    (id, source) => {
      setParam('sel', id)
      if (source === 'list') setFocus({ id, n: Date.now() })
      else setActive({ id, source: 'map' })
    },
    [setParam],
  )

  // Screen-reader summary of the ranking (top three), announced once the weights settle.
  const scoredEntries = app.ranking.filter((r) => r.score !== null)
  const announcement = useDebounced(
    !app.target
      ? ''
      : scoredEntries.length
        ? `Ranking updated. ${scoredEntries
            .slice(0, 3)
            .map((r) => `${r.rank}: ${data.siteById[r.site].name}, score ${r.score}`)
            .join('. ')}.`
        : 'No site can be scored with these weights.',
    400,
  )

  if (!app.target) {
    return (
      <section className="page empty-state">
        <h1>Pick a target site to start</h1>
        <p className="muted">Choose a Moon or Mars site to find Earth places that resemble it.</p>
        <TargetSelect id="explore-target" label="Target site" targets={data.targets} value={null} onChange={app.setTarget} />
        <p>
          <Link to="/">← Guided start</Link>
        </p>
      </section>
    )
  }

  const selParam = params.get('sel')
  const selectedEntry =
    (selParam && app.ranking.find((r) => r.site === selParam)) || scoredEntries[0] || app.ranking[0] || null
  const selectedSite = selectedEntry ? data.siteById[selectedEntry.site] : null
  const avail = dataAvailability(app.target, data.sites, app.weights, data.features)
  const notice = availabilityNotice(avail)
  const scenario = app.isCustom ? null : matchScenario(app.targetId, app.presetId)
  const scoredCount = scoredEntries.length
  const missionLabel = app.isCustom
    ? 'Custom weights'
    : missionTitle(app.presetId)
  const topIds = scoredEntries.slice(0, 3).map((r) => r.site)
  const method = RANK_METHODS[app.rankBy] || RANK_METHODS.score
  // Plain-language ranking explanation shared by the map and list views. Missing data is
  // stated in ordinary words whenever any scored place rests on incomplete measurements.
  // Only gaps on the Earth-site side: a criterion the target itself lacks is covered by the
  // availability notice and cannot move any score (its range stays closed).
  const partial = scoredEntries.filter(hasOpenRange).length
  const rankingHelp = (
    <div id="rankby-help" className="ranking-help">
      <p>
        Ranked by how closely each place’s measured characteristics match this site.{' '}
        <Term id="score">Higher score</Term> = closer match, not mission suitability.
      </p>
      {app.rankBy === 'min' && (
        <p className="ranking-help__method">
          <strong>Most complete evidence first</strong> — places with missing data move down.
          <span className="sr-only"> {method.help}</span>
        </p>
      )}
      {partial > 0 && (
        <p className="ranking-help__gaps">
          <span aria-hidden="true">⚠ </span>
          {partial === 1 ? '1 place is' : `${partial} places are`} missing some measurements, so this ranking may
          change. <Term id="range">Why?</Term>
        </p>
      )}
    </div>
  )
  const tray = (
    <ShortlistBar
      shortlist={app.shortlist}
      siteById={data.siteById}
      onRemove={app.toggleShortlist}
      onClear={app.clearShortlist}
      linkTo={app.linkTo}
      topIds={topIds}
    />
  )
  const shared = {
    ranking: app.ranking,
    siteById: data.siteById,
    target: app.target,
    weights: app.weights,
    features: data.features,
    shortlist: app.shortlist,
    shortlistFull: app.shortlistFull,
    onToggleShortlist: app.toggleShortlist,
    linkTo: app.linkTo,
  }

  return (
    <div className={`explore${panelOpen ? '' : ' explore--collapsed'}`}>
      <aside id="explore-panel" className="explore__panel" aria-label="Mission controls" hidden={!panelOpen}>
        <div className="explore__panel-inner">
          <div className="explore__panel-head">
            <h2>Mission controls</h2>
            <button type="button" className="btn btn--ghost btn--small" onClick={closePanel}>
              Close<span className="sr-only"> mission controls</span>
            </button>
          </div>
          <CriteriaPanel
            advancedOpen={advancedOpen}
            onAdvancedToggle={onAdvancedToggle}
            rankBy={app.rankBy}
            onRankBy={app.setRankBy}
          />
        </div>
      </aside>

      <section className="explore__main" aria-labelledby="explore-title">
        <header className="explore__head">
          <div className="explore__title">
            <p className="hud-label">Explore · mission workspace</p>
            <h1 id="explore-title">
              Earth analogs for {app.target.name.split(' — ')[0]}{' '}
              <span className="muted">({bodyLabel(app.target.body)})</span>
            </h1>
            <p className="explore__sub">
              <span>
                Mission: <strong>{missionLabel}</strong>
              </span>
              <span className="muted">
                {scoredCount} of {data.sites.length} places scored
              </span>
              <span className="muted">{app.rankBy === 'min' ? 'Most complete evidence first' : 'Best match first'}</span>
              {data.isMock && (
                <span>
                  <MockTag /> scores from synthetic data
                </span>
              )}
            </p>
          </div>
          <div className="explore__controls">
            <div className="seg seg--mode" role="group" aria-label="Detail level">
              <button type="button" aria-pressed={!advancedOpen} onClick={() => onAdvancedToggle(false)}>
                Quick
              </button>
              <button type="button" aria-pressed={advancedOpen} onClick={() => onAdvancedToggle(true)}>
                Research
              </button>
            </div>
            <div className="seg" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                <IconMap size={16} />
                Map
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                <IconList size={16} />
                List
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <p className="avail-notice" role="note">
            <strong>Some measurements aren’t available yet.</strong> {notice}
          </p>
        )}

        {scoredCount === 0 && (
          <p className="avail-notice" role="status">
            <strong>No site can be scored with these weights.</strong> A score needs at least {data.minCriteria} selected
            criteria with data.{' '}
            <button type="button" className="link-btn" onClick={app.resetWeights}>
              Reset to {PRESETS[app.basePresetId].label}
            </button>
          </p>
        )}

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {view === 'map' ? (
          <>
            <div className="mc-stage">
              <MapView
                ranking={app.ranking}
                siteById={data.siteById}
                shortlist={app.shortlist}
                isMock={data.isMock}
                active={active}
                onActive={onActive}
                focus={focus}
                selectedId={selectedSite?.id}
                onSelect={onSelect}
              />
              <MatchAnalysis
                entry={selectedEntry}
                site={selectedSite}
                target={app.target}
                weights={app.weights}
                features={data.features}
                minCriteria={data.minCriteria}
                research={advancedOpen}
                isMock={data.isMock}
                linkTo={app.linkTo}
                onToggleShortlist={app.toggleShortlist}
                listed={selectedSite ? app.shortlist.includes(selectedSite.id) : false}
                shortlistFull={app.shortlistFull}
              />
            </div>
            <div className="mc-deck">
              <section className="mc-panel explore__results" aria-labelledby="results-title">
                <header className="mc-panel__head">
                  <h2 id="results-title" className="mc-panel__title">
                    <IconList />
                    Recommended Earth sites
                  </h2>
                </header>
                <div className="explore__results-head">{rankingHelp}</div>
                <SiteCards
                  {...shared}
                  rankBy={app.rankBy}
                  active={active}
                  onActive={onActive}
                  selectedId={selectedSite?.id}
                  onSelect={onSelect}
                />
                {tray}
              </section>
              <TerrainPair target={app.target} site={selectedSite} isMock={data.isMock} linkTo={app.linkTo} />
              <MissionEvidence
                app={app}
                site={selectedSite}
                entry={selectedEntry}
                features={data.features}
                scenario={scenario}
                linkTo={app.linkTo}
                isMock={data.isMock}
              />
            </div>
          </>
        ) : (
          <>
            <div className="explore__table-help">{rankingHelp}</div>
            <ResultsList {...shared} />
            {tray}
          </>
        )}

        <TargetReference target={app.target} features={data.features} isMock={data.isMock} />
      </section>
    </div>
  )
}
