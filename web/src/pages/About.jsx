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

      {!data.isMock && (
        <section className="panel">
          <h2>Data status (research prototype)</h2>
          <ul>
            <li>
              <strong>{data.sites.length} Earth sites</strong> with cited coordinates; <strong>{data.targets.length} targets</strong>{' '}
              (one Moon, one Mars) whose values come from Perseverance (MEDA) and LRO results — see “Target reference
              values” on Explore.
            </li>
            <li>
              Climate (aridity, surface temperature, daily swing): NASA POWER climatology API, MERRA-2 reanalysis,
              2001–2025, 0.5° × 0.625° grid cells (~50 km). Values describe the grid cell, not the exact point.
            </li>
            <li>
              Where a grid cell clearly does not represent the site (site–cell elevation differs by more than 500 m, or an
              island smaller than the cell) the value is shown but not used in scores.
            </li>
            <li>Rock type and ground ice: peer-reviewed literature, cited per site; left empty when evidence is mixed.</li>
            <li>
              Not yet acquired (excluded from all scores): terrain relief (SRTM / ASTER GDEM, needs an Earthdata login) and
              vegetation (MODIS NDVI). Target terrain is also not yet computed.
            </li>
          </ul>
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
          <li>
            A score needs at least {data.minCriteria} criteria with data on both sides; with fewer, the site shows
            “Insufficient data” instead of a score. Confidence is High / Medium / Low depending on how many of your
            selected criteria had data.
          </li>
          <li>
            Moon and Mars are colder and drier than anywhere on Earth. Where a target value lies beyond Earth’s range it
            is set to Earth’s extreme (marked “Beyond Earth range”), so the score then means “as close as Earth gets”.
          </li>
          <li>
            Temperature compares <em>surface</em> temperatures (Earth skin temperature vs. measured regolith/ground
            temperature), because the Moon has no air.
          </li>
          <li>“Why” lists the criteria that contribute most (with at least 70% similarity); “Where it falls short” is the selected criterion with the lowest similarity.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>Catalogued analogs and uncatalogued candidates</h2>
        <p>
          A <strong>catalogued analog</strong> is a site with a peer-reviewed Moon/Mars analog study (cited on its page)
          or on this project’s reference list. An <strong>uncatalogued candidate</strong> is more than 300 km from every
          catalogued site and we found no peer-reviewed analog study of it. That is not proof that nobody has studied it,
          and it is not a validated analog — it is a lead worth field validation.
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
