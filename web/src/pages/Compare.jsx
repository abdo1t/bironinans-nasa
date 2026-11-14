import { Link } from 'react-router-dom'
import CompareTable from '../components/CompareTable.jsx'
import RadarCompare from '../components/RadarCompare.jsx'
import TargetSelect from '../components/TargetSelect.jsx'
import { MockTag } from '../components/Tags.jsx'
import { useBundle } from '../data/useBundle.js'
import { bodyLabel } from '../lib/format.js'
import { compareVerdict } from '../lib/verdict.js'
import { useAppState } from '../state/AppState.jsx'

export default function Compare() {
  const { data } = useBundle()
  const app = useAppState()
  const sites = app.shortlist.map((id) => data.siteById[id])

  if (!app.target) {
    return (
      <section className="page empty-state">
        <h1>Compare sites</h1>
        <p className="muted">Pick a target first.</p>
        <TargetSelect id="compare-target" targets={data.targets} value={null} onChange={app.setTarget} />
      </section>
    )
  }

  if (sites.length < 2) {
    return (
      <section className="page empty-state">
        <h1>Compare sites</h1>
        <p>
          Add 2–3 sites to your shortlist to compare them side by side.{' '}
          {sites.length === 1 && <>So far: {sites[0].name}. </>}
        </p>
        <Link className="btn btn--primary" to={app.linkTo('/explore', { view: 'list' })}>
          Choose sites in Explore
        </Link>
      </section>
    )
  }

  const lines = compareVerdict(sites, app.target, data.features, app.weights, app.rankBySite, app.rankBy)

  return (
    <section className="page compare">
      <header className="compare__head">
        <div>
          <h1>
            Compare for {app.target.name} <span className="muted">({bodyLabel(app.target.body)})</span>
          </h1>
          {data.isMock && (
            <p className="muted">
              <MockTag /> All values are synthetic placeholders.
            </p>
          )}
        </div>
        <div className="compare__actions">
          {sites.map((s) => (
            <button key={s.id} type="button" className="btn btn--ghost btn--small" onClick={() => app.toggleShortlist(s.id)}>
              Remove {s.name}
            </button>
          ))}
          <Link className="btn btn--ghost btn--small" to={app.linkTo('/explore', { view: 'list' })}>
            Change sites
          </Link>
        </div>
      </header>

      <section className="panel verdict" aria-label="Verdict">
        <h2>Verdict</h2>
        <ul>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <div className="compare__grid">
        <section className="panel">
          <h2>Similarity profile</h2>
          <RadarCompare sites={sites} target={app.target} features={data.features} />
        </section>
        <section className="panel">
          <h2>Side by side</h2>
          <CompareTable
            sites={sites}
            target={app.target}
            features={data.features}
            weights={app.weights}
            rankBySite={app.rankBySite}
            linkTo={app.linkTo}
          />
        </section>
      </div>
    </section>
  )
}
