import { useParams } from 'react-router-dom'
import { useBundle } from '../data/useBundle.js'

// Placeholder — Phase 2 adds ScoreBars, why/gap, sources.
export default function SiteDetails() {
  const { id } = useParams()
  const { data } = useBundle()
  const site = data.siteById[id]

  if (!site) return <p className="status">Unknown site: {id}</p>

  return (
    <section className="page">
      <h1>{site.name}</h1>
      <p>{site.country}</p>
      <p className="placeholder">Score breakdown arrives in Phase 2.</p>
    </section>
  )
}
