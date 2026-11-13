import { useSearchParams } from 'react-router-dom'
import CriteriaPanel from '../components/CriteriaPanel.jsx'
import MapView from '../components/MapView.jsx'
import ResultsList from '../components/ResultsList.jsx'
import ShortlistBar from '../components/ShortlistBar.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import { MockTag } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel } from '../lib/format.js'
import { PRESETS } from '../lib/presets.js'
import { useAppState } from '../state/AppState.jsx'

export default function Explore() {
  const { data } = useBundle()
  const app = useAppState()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'list' ? 'list' : 'map'

  const setView = (v) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === 'map') next.delete('view')
        else next.set('view', v)
        return next
      },
      { replace: true },
    )

  if (!app.target) {
    return (
      <section className="page empty-state">
        <h1>Pick a target to start</h1>
        <p className="muted">Choose a Moon or Mars base site to rank Earth analogs against.</p>
        <TargetSelect id="explore-target" targets={data.targets} value={null} onChange={app.setTarget} />
      </section>
    )
  }

  const top = app.ranking.find((r) => r.score !== null)
  const scoredCount = app.ranking.filter((r) => r.score !== null).length
  const shared = {
    ranking: app.ranking,
    siteById: data.siteById,
    shortlist: app.shortlist,
    shortlistFull: app.shortlistFull,
    onToggleShortlist: app.toggleShortlist,
    linkTo: app.linkTo,
  }

  return (
    <div className="explore">
      <aside className="explore__panel" aria-label="Criteria">
        <CriteriaPanel />
      </aside>

      <section className="explore__main" aria-labelledby="explore-title">
        <header className="explore__head">
          <div>
            <h1 id="explore-title">
              Earth analogs for {app.target.name}{' '}
              <span className="muted">({bodyLabel(app.target.body)})</span>
            </h1>
            <p className="muted">
              {scoredCount} of {data.sites.length} sites scored ·{' '}
              {app.isCustom ? 'Custom weights' : PRESETS[app.presetId].label}
              {data.isMock && (
                <>
                  {' '}
                  · <MockTag /> scores from synthetic data
                </>
              )}
            </p>
          </div>
          <div className="toggle" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
              Map
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              List
            </button>
          </div>
        </header>

        <p className="sr-only" aria-live="polite">
          {top ? `Ranking updated. Top site: ${data.siteById[top.site].name}, score ${top.score}.` : 'No site could be scored.'}
        </p>

        <ShortlistBar
          shortlist={app.shortlist}
          siteById={data.siteById}
          onRemove={app.toggleShortlist}
          onClear={app.clearShortlist}
          linkTo={app.linkTo}
        />

        {view === 'map' ? <MapView {...shared} isMock={data.isMock} /> : <ResultsList {...shared} target={app.target} />}
      </section>
    </div>
  )
}
