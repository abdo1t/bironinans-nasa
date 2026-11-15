import { useBundle } from '../data/useBundle.js'
import { dataAvailability, featureScaleText } from '../lib/explain.js'
import { PRESETS, WEIGHT_MAX, WEIGHT_MIN } from '../lib/presets.js'
import { weightsEqual } from '../lib/urlState.js'
import { useAppState } from '../state/AppState.jsx'
import Term from './Term.jsx'

/**
 * One importance slider per criterion (0 = not used … 5 = most important), plus a reset to the
 * chosen test type. Shared by Home ("Criteria and importance") and Explore (Advanced options),
 * so both edit the same weights in AppState — one scoring system.
 */
export default function WeightSliders({ idPrefix = 'w', legend = 'Criterion weights' }) {
  const { data } = useBundle()
  const app = useAppState()
  const atBase = weightsEqual(app.weights, PRESETS[app.basePresetId].weights, data.features)
  const avail = app.target ? dataAvailability(app.target, data.sites, app.weights, data.features) : null
  return (
    <>
      <fieldset className="sliders">
        <legend className="sliders__legend">{legend}</legend>
        <p className="hint">
          <Term id="weight">0 = not used · 5 = most important.</Term> The ranking updates as you drag.
        </p>
        {data.features.map((f) => {
          const w = app.weights[f.id] || 0
          const inputId = `${idPrefix}-${f.id}`
          const noData = avail?.byFeature[f.id] || null
          const scale = featureScaleText(f)
          const noDataText =
            noData === 'target'
              ? 'The target has no value for this criterion, so its weight cannot change the ranking.'
              : 'No candidate site has a value for this criterion yet, so its weight cannot change the ranking.'
          return (
            <div key={f.id} className={`slider${w === 0 ? ' slider--off' : ''}`}>
              <div className="slider__head">
                <label htmlFor={inputId}>{f.label}</label>
                {noData && (
                  <span className="tag tag--nodata" title={noDataText}>
                    no data — no effect
                  </span>
                )}
                <output htmlFor={inputId} className="slider__value">
                  {w === 0 ? 'off' : w}
                </output>
              </div>
              <input
                id={inputId}
                type="range"
                min={WEIGHT_MIN}
                max={WEIGHT_MAX}
                step={1}
                value={w}
                aria-valuetext={w === 0 ? `0 of ${WEIGHT_MAX}, not used` : `${w} of ${WEIGHT_MAX}`}
                aria-describedby={`${inputId}-desc`}
                onChange={(e) => app.setWeight(f.id, Number(e.target.value))}
              />
              <p id={`${inputId}-desc`} className="slider__desc">
                {f.description}
                {scale && <span className="slider__scale">{scale}</span>}
                {noData && (
                  <span className="sr-only">
                    {' '}
                    No data {noData === 'target' ? 'for this target' : 'for any site'}: this weight has no effect.
                  </span>
                )}
              </p>
            </div>
          )
        })}
      </fieldset>
      <button type="button" className="btn btn--ghost btn--small" onClick={app.resetWeights} disabled={atBase}>
        Reset to {PRESETS[app.basePresetId].label}
      </button>
    </>
  )
}
