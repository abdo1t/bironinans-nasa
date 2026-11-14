import { useBundle } from '../data/useBundle.js'
import { CitationText, MockTag } from '../components/Tags.jsx'
import { bundleUsesDataset, featuresMissingEverywhere, joinLabels } from '../lib/explain.js'
import { LIMITATIONS_NOTE } from '../lib/scoring.js'

// Datasets and their citations. `feature` + `match` let the page say honestly whether
// this bundle already contains values from that dataset (sites, or targets when scope = 'targets').
const SOURCES = [
  {
    label: 'NASA POWER climatology API (aridity, surface temperature, daily temperature swing)',
    citation: 'NASA Langley Research Center, Prediction Of Worldwide Energy Resources (POWER) Project.',
    url: 'https://power.larc.nasa.gov/',
    feature: 'aridity',
    match: 'POWER',
  },
  {
    label: 'MERRA-2 reanalysis (the model behind the POWER climate values)',
    citation:
      'Gelaro, R., et al. 2017. The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2). J. Climate 30, 5419–5454. doi:10.1175/JCLI-D-16-0758.1',
    feature: 'aridity',
    match: 'MERRA',
  },
  {
    label: 'NASADEM (Earth terrain relief)',
    citation:
      'NASA JPL. NASADEM Merged DEM Global 1 arc second V001 (NASADEM_HGT), NASA EOSDIS LP DAAC. doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001',
    feature: 'terrain',
    match: 'NASADEM',
  },
  {
    label: 'Copernicus DEM GLO-30 Public (Earth terrain relief)',
    citation: 'Copernicus DEM GLO-30, 2021 release, ESA / European Union; distributed via AWS Open Data.',
    url: 'https://copernicus-dem-30m.s3.amazonaws.com/readme.html',
    attribution:
      '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
    feature: 'terrain',
    match: 'Copernicus',
  },
  {
    label: 'SRTMGL1 v003 (Earth terrain relief, if used)',
    citation: 'NASA JPL. NASA Shuttle Radar Topography Mission Global 1 arc second V003, NASA EOSDIS LP DAAC.',
    url: 'https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003',
    feature: 'terrain',
    match: 'SRTMGL1',
  },
  {
    label: 'MODIS MOD13Q1 v061 NDVI (bare ground)',
    citation:
      'Didan, K. 2021. MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061 (MOD13Q1), NASA EOSDIS LP DAAC. doi:10.5067/MODIS/MOD13Q1.061',
    feature: 'veg',
    match: 'MOD13Q1',
  },
  {
    label: 'USGS Mars 2020 CTX DTM mosaic (Jezero terrain relief)',
    citation:
      'USGS Astrogeology, Mars 2020 Terrain Relative Navigation CTX DTM (JEZ_ctx_B_soc_008, 20 m); Fergason et al. 2020, LPSC 51, “Mars 2020 TRN flight product generation”.',
    url: 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif',
    feature: 'terrain',
    match: 'CTX',
    scope: 'targets',
  },
  {
    label: 'LRO LOLA polar DEM LDEM_875S (lunar south pole terrain relief)',
    citation:
      'LRO LOLA gridded polar DEM (LRO-L-LOLA-4-GDR-V1.0), PDS Geosciences Node; Smith et al. 2010, GRL 37, L18204. doi:10.1029/2010GL043751',
    url: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/',
    feature: 'terrain',
    match: 'LOLA',
    scope: 'targets',
  },
  {
    label: 'EMIT L2B minerals (geology, if used)',
    citation: 'NASA JPL EMIT L2B Estimated Mineral Identification and Band Depth, NASA EOSDIS LP DAAC.',
    url: 'https://cmr.earthdata.nasa.gov/search/concepts/C2408034484-LPCLOUD.html',
    feature: 'geology',
    match: 'EMIT',
  },
  { label: 'NASA Moon / Mars Trek (target site viewers)', url: 'https://trek.nasa.gov/' },
  { label: 'Basemap tiles: Esri World Dark Gray Canvas', url: 'https://www.esri.com/' },
]

const AI_STATEMENT =
  "This project's code and documentation were developed with assistance from an AI coding assistant (Claude); " +
  'the team reviewed the outputs. Scientific values come from the cited datasets and publications, not from AI generation.'

function boundsText(f) {
  if (f.kind !== 'numeric') {
    const rel = Object.entries(f.related || {})
      .map(([k, v]) => `${k} ~ ${v.join(', ')}`)
      .join('; ')
    return rel ? `categories (related: ${rel})` : 'categories'
  }
  return `${f.earthMin} to ${f.earthMax}`
}

export default function About() {
  const { data } = useBundle()
  const missing = featuresMissingEverywhere(data.sites, data.features)
  const inBundle = (src) =>
    src.feature ? bundleUsesDataset(src.scope === 'targets' ? data.targets : data.sites, src.feature, src.match) : null
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
            {missing.length > 0 ? (
              <li>
                No site has a value yet for: {joinLabels(missing.map((f) => f.label))}. These criteria are excluded from all
                scores (Explore says so next to the affected sliders).
              </li>
            ) : (
              <li>Every criterion has values for at least one site; see each site’s Data sources table for gaps.</li>
            )}
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
            “Insufficient data” instead of a score. “Evidence: High / Medium / Low” is the share of your selected{' '}
            <em>weight</em> whose criteria have data (High ≥ 80 %; Low &lt; 50 % or fewer than 3 criteria). It says how
            much of the score rests on data, not how accurate the data are.
          </li>
          <li>
            Moon and Mars are colder and drier than anywhere on Earth. Where a target value lies beyond Earth’s range it
            is set to Earth’s extreme (marked “Beyond Earth range”), so the score then means “as close as Earth gets”.
          </li>
          <li>
            Temperature compares <em>surface</em> temperatures (Earth skin temperature vs. measured regolith/ground
            temperature), because the Moon has no air.
          </li>
          <li>
            “Closest matches” lists the criteria that contribute most (with at least 70% similarity); “Where it falls
            short” is the criterion below 70% that costs the most points. “Points lost” shows, per criterion, weight ×
            (1 − similarity) ÷ total weight with data × 100, so the score plus all points lost is 100.
          </li>
          <li>
            The score range (e.g. “68 · range 39–82”) is the score the site would get if every selected criterion it has
            no data for were a total mismatch (low end) or a perfect match (high end). When the ranges of two sites
            overlap, their order is not settled by the data we have.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h2>Catalogued analogs and sites not in the reference catalogue</h2>
        <p>
          A <strong>catalogued analog</strong> is a site with a peer-reviewed Moon/Mars analog study (cited on its page)
          or on this project’s reference list. A site marked <strong>not in reference catalogue</strong> is more than 300 km from every
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
        <h2>Criteria definitions</h2>
        <div className="table-scroll">
          <table className="criteria-defs">
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">Unit</th>
                <th scope="col">Earth bounds (→ 0…1)</th>
                <th scope="col">Inverted</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((f) => (
                <tr key={f.id}>
                  <th scope="row">
                    {f.label}
                    {f.description && <span className="cell-note">{f.description}</span>}
                  </th>
                  <td>{f.unit || '—'}</td>
                  <td>{boundsText(f)}</td>
                  <td>{f.kind === 'numeric' ? (f.invert ? 'yes (1 − x)' : 'no') : '—'}</td>
                  <td>{f.source || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Numeric values are scaled with these fixed Earth bounds, never the sample minimum/maximum, and clipped to 0–1.
          Categorical criteria score 1 for the same class, 0.5 for a related class, otherwise 0.
        </p>
      </section>

      <section className="panel">
        <h2>Data sources</h2>
        <ul className="source-list">
          {SOURCES.map((src) => {
            const used = inBundle(src)
            return (
              <li key={src.label}>
                <strong>{src.label}</strong>{' '}
                {used !== null && (
                  <span className={`tag ${used ? 'tag--evidence' : 'tag--pending'}`}>
                    {used ? 'values in this bundle' : 'not in this bundle yet'}
                  </span>
                )}
                {src.citation && (
                  <span className="source-list__cite">
                    <CitationText text={src.citation} />
                  </span>
                )}
                {src.attribution && <span className="source-list__cite">Attribution: {src.attribution}</span>}
                {src.url && (
                  <a href={src.url} target="_blank" rel="noreferrer" className="source-list__url">
                    {src.url} ↗
                  </a>
                )}
              </li>
            )
          })}
        </ul>
        <p className="hint">
          The app never calls NASA APIs at runtime; all data is precomputed into a static bundle. Each site’s page lists
          the exact dataset, parameter, period and request for every value.
        </p>
      </section>

      <section className="panel">
        <h2>Use of AI</h2>
        <p>{AI_STATEMENT}</p>
      </section>

      <section className="panel">
        <h2>Team</h2>
        <p className="muted">NASA Space Apps Challenge 2026 team — names TBD.</p>
      </section>
    </article>
  )
}
