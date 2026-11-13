import { useBundle } from '../data/useBundle.js'

// Placeholder — Phase 2 adds WorldCard + TargetSelect.
export default function Home() {
  const { data } = useBundle()
  const moon = data.targets.filter((t) => t.body === 'moon').length
  const mars = data.targets.filter((t) => t.body === 'mars').length

  return (
    <section className="page">
      <h1>Find Earth analogs for Moon and Mars base sites</h1>
      <p>
        Bundle loaded: {data.targets.length} targets ({moon} Moon, {mars} Mars), {data.sites.length} Earth
        sites, {data.features.length} criteria.
      </p>
      <p className="placeholder">World cards and target selection arrive in Phase 2.</p>
    </section>
  )
}
