import { useBundle } from '../data/useBundle.js'
import { MockTag } from '../components/Tags.jsx'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'

const SOURCES = [
  ['NASA POWER climatology (temperature, precipitation)', 'https://power.larc.nasa.gov/'],
  ['SRTMGL1 v003 elevation (terrain roughness)', 'https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003'],
  ['EMIT L2B minerals (geology, where available)', 'https://cmr.earthdata.nasa.gov/search/concepts/C2408034484-LPCLOUD.html'],
  ['NASA Moon / Mars Trek (target sites)', 'https://trek.nasa.gov/'],
  ['Basemap tiles: Esri World Dark Gray', 'https://www.esri.com/'],
]

export default function About() {
  const { data } = useBundle()
  return (
    <article className="page about">
      <h1>About Earth Analog Finder</h1>

      {data.isMock && (
        <section className="panel">
          <h2>
            Data status <MockTag />
          </h2>
          <p>
            This build runs on a <strong>mock</strong> data bundle. Every numeric value is a synthetic placeholder, and
            geology/ice classes are either synthetic or unverified literature classes from our seed list. Nothing shown
            is a NASA observation yet; real NASA POWER and SRTM values arrive in the next phase.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>Method</h2>
        <ol>
          <li>Each Earth site and each Moon/Mars target is described by up to seven criteria, scaled 0–1 using fixed Earth bounds.</li>
          <li>For each criterion we measure similarity: 1 − the gap between site and target (or 1 / 0.5 / 0 for matching, related or different rock types and ice).</li>
          <li>The score is the weighted average of those similarities × 100, using your weights (0 = ignore).</li>
          <li>
            If a value is missing, that criterion is <strong>left out</strong> of the score — it is never counted as
            zero. The coverage badge (e.g. “5/6 criteria”) shows how many of your selected criteria had data. If none
            did, the site gets no score and sorts last.
          </li>
          <li>“Why” lists the criteria that contribute most (with at least 70% similarity); “Where it falls short” is the selected criterion with the lowest similarity.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>Catalogued analogs and uncatalogued candidates</h2>
        <p>
          A <strong>catalogued analog</strong> is a site already used for Moon/Mars analog research. An{' '}
          <strong>uncatalogued candidate</strong> is simply more than 300 km from every catalogued analog. It is a lead
          worth field validation — not a scientifically validated new analog.
        </p>
      </section>

      <section className="panel limitations">
        <h2>Limitations</h2>
        <ul>
          <li>{LIMITATIONS_NOTE}</li>
          <li>Seven coarse criteria cannot capture everything that matters for a mission rehearsal.</li>
          <li>Site coordinates are approximate and need verification.</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Data sources (planned)</h2>
        <ul>
          {SOURCES.map(([label, url]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {label} ↗
              </a>
            </li>
          ))}
        </ul>
        <p className="hint">The app never calls NASA APIs at runtime; all data is precomputed into a static bundle.</p>
      </section>

      <section className="panel">
        <h2>Team</h2>
        <p className="muted">NASA Space Apps Challenge 2026 team — names TBD.</p>
      </section>
    </article>
  )
}
