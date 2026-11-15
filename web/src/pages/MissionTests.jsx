import { Link, useSearchParams } from 'react-router-dom'
import { useMethodV1 } from '../data/useMethodV1.js'
import {
  PROVISIONAL_LABEL,
  confidenceLabel,
  defaultTargetId,
  fmtPct,
  fmtRange,
  fmtScore,
  fmtValue,
  loc,
  resultsFor,
  statusReason,
  testsForTarget,
} from '../lib/methodV1.js'
import { useAppState } from '../state/AppState.jsx'
import '../styles/missiontests.css'

// Mission tests (analog method v1.0.0): precomputed, explainable, PROVISIONAL similarity of
// 12 Earth sites to a Mars/Moon target for one mission test at a time. Display rules from
// docs/method_v1_INTEGRATION.md are applied here and in lib/methodV1.js:
//   order inside one test only, labelled provisional (never "ranking"/"best"); score always with
//   range + confidence (+ warning if sensitive); unscored -> reason, never 0; negative control
//   marked; lighting = geometry only; Moon target is regional; no averages across tests/targets.

const PARAM_COLORS = ['#5fe0f2', '#f4ab5e', '#9ee0c4', '#b9a2f2', '#e6b98a', '#86b6ef']

function T({ en, ar, lang }) {
  return lang === 'ar' ? (
    <span dir="rtl" lang="ar">
      {ar}
    </span>
  ) : (
    <>{en}</>
  )
}

/** Score range on a 0–1 track: the band is score_range, the dot the score. */
function RangeBar({ score, range }) {
  if (!Array.isArray(range)) return null
  const [lo, hi] = range
  return (
    <span className="mt-range" aria-hidden="true">
      <span className="mt-range__band" style={{ left: `${lo * 100}%`, width: `${Math.max(0.5, (hi - lo) * 100)}%` }} />
      {typeof score === 'number' && <span className="mt-range__dot" style={{ left: `${score * 100}%` }} />}
    </span>
  )
}

function ConfidenceChip({ r, lang }) {
  return (
    <span className={`mt-conf mt-conf--${r.confidence}`}>
      {r.sensitive_to_assumptions && (
        <span className="mt-warn" title="Sensitive to assumptions: the score range is wider than 0.4 (window size / tolerance)">
          ⚠<span className="sr-only"> sensitive to assumptions;</span>{' '}
        </span>
      )}
      {confidenceLabel(r.confidence, lang)}
    </span>
  )
}

function ResultRow({ r, d, lang, selected, onSelect }) {
  const scored = r.status === 'scored'
  return (
    <li className={`mt-row${selected ? ' is-selected' : ''}${scored ? '' : ' mt-row--none'}${r.negative_control ? ' mt-row--neg' : ''}`}>
      <button type="button" className="mt-row__btn" aria-pressed={selected} onClick={() => onSelect(r.site_id)}>
        <span className="mt-row__name">
          <span dir="auto">{loc(r, 'site_name', lang)}</span>
          {r.negative_control && <span className="mt-neg">Negative control · عينة ضابطة</span>}
        </span>
        {scored ? (
          <span className="mt-row__score">
            <span className="mt-row__num">{fmtScore(r.score)}</span>
            <RangeBar score={r.score} range={r.score_range} />
            <span className="mt-row__meta">
              range {fmtRange(r.score_range) ?? '—'} · coverage {fmtPct(r.coverage)}
            </span>
            <ConfidenceChip r={r} lang={lang} />
          </span>
        ) : (
          <span className="mt-row__reason" dir="auto">
            {statusReason(r, d.meta, lang)}
          </span>
        )}
      </button>
    </li>
  )
}

function ContributionBar({ r, lang }) {
  const items = (r.contributions || []).filter((c) => typeof c.contribution === 'number')
  if (!items.length) return null
  return (
    <figure className="mt-contrib">
      <figcaption className="mt-contrib__cap">
        How the score {fmtScore(r.score)} is made up: each part = weight × comparability × similarity, normalised; the
        parts sum to the score.
      </figcaption>
      <div className="mt-contrib__track" role="img" aria-label={items.map((c) => `${c.label_en} ${c.contribution.toFixed(2)}`).join(', ')}>
        {items.map((c, i) => (
          <span
            key={c.parameter}
            className="mt-contrib__seg"
            style={{ width: `${c.contribution * 100}%`, background: PARAM_COLORS[i % PARAM_COLORS.length] }}
            title={`${c.label_en}: ${c.contribution.toFixed(3)}`}
          />
        ))}
      </div>
      <ul className="mt-contrib__legend">
        {items.map((c, i) => (
          <li key={c.parameter}>
            <span className="mt-contrib__sw" style={{ background: PARAM_COLORS[i % PARAM_COLORS.length] }} aria-hidden="true" />
            <span dir="auto">{loc(c, 'label', lang)}</span> <strong>{c.contribution.toFixed(2)}</strong>
          </li>
        ))}
      </ul>
    </figure>
  )
}

const NA = <span className="mt-na">not available</span>

function Detail({ r, d, lang, target }) {
  if (!r) return null
  const scored = r.status === 'scored'
  return (
    <section className="mt-detail" aria-labelledby="mt-detail-title">
      <header className="mt-detail__head">
        <p className="kicker">
          <span dir="auto">{loc(r, 'mission_test', lang)}</span> · {target.name}
        </p>
        <h2 id="mt-detail-title" dir="auto">
          {loc(r, 'site_name', lang)}
        </h2>
        {r.negative_control && (
          <p className="mt-negnote">
            <strong>Negative control.</strong> Included on purpose and expected to be a poor analog. A mid-pack terrain
            score here is the main evidence that terrain-only scores are not a full analog assessment.
          </p>
        )}
      </header>

      {scored ? (
        <div className="mt-detail__score">
          <div>
            <span className="mt-detail__label">
              <T lang={lang} en={PROVISIONAL_LABEL.en} ar={PROVISIONAL_LABEL.ar} />
            </span>
            <span className="mt-detail__num">{fmtScore(r.score)}</span>
            <span className="mt-detail__of"> / 1</span>
          </div>
          <dl className="mt-detail__facts">
            <div>
              <dt>Sensitivity range</dt>
              <dd>
                {fmtRange(r.score_range)} {r.sensitive_to_assumptions && <span className="mt-warn">⚠ wide (&gt; 0.4)</span>}
              </dd>
            </div>
            <div>
              <dt>Data coverage</dt>
              <dd>{fmtPct(r.coverage)} of the test’s weight</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>
                <ConfidenceChip r={r} lang={lang} />
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-detail__reason" dir="auto">
          <strong>No score.</strong> {statusReason(r, d.meta, lang)}
        </p>
      )}

      <p className="mt-detail__summary" dir="auto">
        {loc(r, 'summary', lang)}
      </p>

      {scored && <ContributionBar r={r} lang={lang} />}

      <div className="mt-table-wrap">
        <table className="mt-table">
          <caption className="sr-only">Parameters for this test: Earth and target values, similarity and contribution</caption>
          <thead>
            <tr>
              <th scope="col">Parameter</th>
              <th scope="col">Earth</th>
              <th scope="col">Target</th>
              <th scope="col">Similarity</th>
              <th scope="col">Weight</th>
              <th scope="col">Comparability</th>
              <th scope="col">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {(r.contributions || []).map((c) => (
              <tr key={c.parameter}>
                <th scope="row">
                  <span dir="auto">{loc(c, 'label', lang)}</span>
                  {c.note && (
                    <span className="mt-note" dir="auto">
                      {c.note}
                    </span>
                  )}
                  {typeof c.earth_percentile_in_target_region === 'number' && (
                    <span className="mt-note">
                      Earth value sits at the {c.earth_percentile_in_target_region.toFixed(0)}th percentile of the lunar
                      region’s 10 km windows.
                    </span>
                  )}
                </th>
                <td>{fmtValue(c.earth_value, c.unit) ?? NA}</td>
                <td>{fmtValue(c.target_value, c.unit) ?? NA}</td>
                <td>{typeof c.similarity === 'number' ? c.similarity.toFixed(2) : <span className="mt-na">not compared</span>}</td>
                <td>{typeof c.weight === 'number' ? c.weight.toFixed(2) : '—'}</td>
                <td>
                  <span className={`mt-comp mt-comp--${c.comparability}`}>
                    {c.comparability}
                    {typeof c.comparability_factor === 'number' && c.comparability_factor !== 1 ? ` ×${c.comparability_factor}` : ''}
                  </span>
                </td>
                <td>{typeof c.contribution === 'number' ? c.contribution.toFixed(2) : <span className="mt-na">excluded</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(r.context || []).length > 0 && (
        <div className="mt-context">
          <h3>Context only — shown, never scored</h3>
          <ul>
            {r.context.map((c) => (
              <li key={c.parameter}>
                <strong dir="auto">{loc(c, 'label', lang)}:</strong> Earth {fmtValue(c.earth_value, c.unit) ?? 'not available'}{' '}
                · target {fmtValue(c.target_value, c.unit) ?? 'not available'}
                {c.note && (
                  <span className="mt-note" dir="auto">
                    {c.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(r.site_caveats || []).length > 0 && (
        <div className="mt-caveats">
          <h3>Site caveats</h3>
          <ul>
            {r.site_caveats.map((c) => (
              <li key={c} dir="auto">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-detail__method">
        <Link to="/method/ar">شرح المنهجية بالعربي — Method explanation (Arabic)</Link>
      </p>
    </section>
  )
}

export default function MissionTests() {
  const { status, data: d, error, retry } = useMethodV1()
  const app = useAppState()
  const [params, setParams] = useSearchParams()
  const set = (patch) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  if (status === 'loading')
    return (
      <p className="status" role="status">
        Loading mission-test results…
      </p>
    )
  if (status === 'error')
    return (
      <section className="page empty-state" role="alert">
        <h1>Mission-test results could not be loaded</h1>
        <p className="muted">{error?.message}</p>
        <button type="button" className="btn btn--primary" onClick={retry}>
          Retry
        </button>
      </section>
    )

  const lang = params.get('lang') === 'ar' ? 'ar' : 'en'
  const targetId = d.targets.some((t) => t.id === params.get('tgt')) ? params.get('tgt') : defaultTargetId(d, app.targetId)
  const target = d.targets.find((t) => t.id === targetId)
  const tests = testsForTarget(d, targetId)
  const testId = tests.some((m) => m.id === params.get('test')) ? params.get('test') : tests[0]?.id
  const test = tests.find((m) => m.id === testId)
  const rows = test ? resultsFor(d, targetId, testId) : []
  const selected = rows.find((r) => r.site_id === params.get('site')) || rows[0] || null
  const scoredCount = rows.filter((r) => r.status === 'scored').length
  const meta = d.meta

  return (
    <section className="page mt" aria-labelledby="mt-title">
      <header className="mt-head">
        <p className="kicker">
          Analog method v{meta.method_version} · {meta.provisional ? 'provisional results' : 'results'} · generated{' '}
          {String(meta.generated_utc || '').slice(0, 10)}
        </p>
        <h1 id="mt-title">Mission tests</h1>
        <p className="mt-lede">
          How closely each of {Object.keys(d.earth_sites).length} Earth sites resembles a Mars or Moon target{' '}
          <strong>for one mission test at a time</strong> — terrain computed with the same algorithm at the same grid
          spacing on both worlds, with every parameter’s share visible.
        </p>
        <div className="mt-banner" role="note">
          <p>
            <strong>Provisional — not a final ranking.</strong> {meta.display_guidance}
          </p>
          <p className="mt-banner__links">
            <Link to="/method/ar">شرح المنهجية (عربي) — Method explanation</Link>
            <span className="seg seg--tiny" role="group" aria-label="Data labels language">
              <button type="button" aria-pressed={lang === 'en'} onClick={() => set({ lang: null })}>
                English
              </button>
              <button type="button" aria-pressed={lang === 'ar'} onClick={() => set({ lang: 'ar' })}>
                العربية
              </button>
            </span>
          </p>
        </div>
      </header>

      <div className="mt-controls">
        <label className="mt-field">
          <span>Target</span>
          <select value={targetId} onChange={(e) => set({ tgt: e.target.value, site: null })}>
            {d.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.body === 'moon' ? 'Moon' : 'Mars'} · {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-field">
          <span id="mt-test-label">Mission test</span>
          <div className="mt-tests" role="group" aria-labelledby="mt-test-label">
            {tests.map((m) => (
              <button key={m.id} type="button" className="mt-test" aria-pressed={m.id === testId} onClick={() => set({ test: m.id, site: null })}>
                <span dir="auto">{loc(m, 'label', lang)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-notes">
        {test && (
          <p className={`mt-note-box${test.id === 'lighting_geometry' ? ' mt-note-box--warn' : ''}`}>
            {test.id === 'lighting_geometry' && <strong>Sun geometry only — this is not an environmental or terrain analog. </strong>}
            {test.rationale}
          </p>
        )}
        {target?.type === 'region' && (
          <p className="mt-note-box">
            <strong>
              Regional target
              {Array.isArray(target.lat_range) ? ` (${Math.abs(target.lat_range[1])}–${Math.abs(target.lat_range[0])}° S)` : ''}, not
              a landing site.
            </strong>{' '}
            Target values are medians over the region’s 10 km windows.
          </p>
        )}
        <p className="mt-note-box mt-note-box--quiet">
          Scores compare sites within this one test only. They are not comparable across tests or targets and are never
          averaged. {scoredCount} of {rows.length} sites scored for this test.
        </p>
      </div>

      <div className="mt-layout">
        <section className="mt-list" aria-labelledby="mt-list-title">
          <h2 id="mt-list-title" className="mt-list__title">
            <T lang={lang} en={PROVISIONAL_LABEL.en} ar={PROVISIONAL_LABEL.ar} />
            <span className="mt-list__sub">ordered by score inside this test · bar = sensitivity range, dot = score</span>
          </h2>
          <ol className="mt-rows">
            {rows.map((r) => (
              <ResultRow key={r.site_id} r={r} d={d} lang={lang} selected={selected?.site_id === r.site_id} onSelect={(id) => set({ site: id })} />
            ))}
          </ol>
        </section>
        <Detail r={selected} d={d} lang={lang} target={target} />
      </div>

      <footer className="mt-foot">
        <p>{meta.score_definition}</p>
        <p>
          Coverage: {meta.coverage_definition} Range: {meta.score_range_definition}
        </p>
      </footer>
    </section>
  )
}
