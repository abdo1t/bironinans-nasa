import { useBundle } from '../data/useBundle.js'
import { dataAvailability, featureScaleText } from '../lib/explain.js'
import { PRESETS, WEIGHT_MAX, WEIGHT_MIN } from '../lib/presets.js'
import { weightsEqual } from '../lib/urlState.js'
import { useAppState } from '../state/AppState.jsx'
import TargetSelect from './TargetSelect.jsx'

export default function CriteriaPanel() {
  const { data } = useBundle()
  const app = useAppState()
  const atBase = weightsEqual(app.weights, PRESETS[app.basePresetId].weights, data.features)
  const avail = app.target ? dataAvailability(app.target, data.sites, app.weights, data.features) : null
  const rationale = PRESETS[app.isCustom ? app.basePresetId : app.presetId]?.rationale

  return (
    <div className="criteria">
      <TargetSelect
        id="criteria-target"
        label="Base site"
        targets={data.targets}
        value={app.targetId}
        onChange={app.setTarget}
      />

      <div className="field">
        <label htmlFor="criteria-preset">What matters</label>
        <select
          id="criteria-preset"
          value={app.presetId}
          aria-describedby="criteria-preset-why"
          onChange={(e) => app.setPreset(e.target.value)}
        >
          {Object.entries(PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
          {app.isCustom && (
            <option value="custom" disabled>
              Custom weights
            </option>
          )}
        </select>
        {rationale && (
          <p id="criteria-preset-why" className="preset-why">
            {app.isCustom && <>Based on {PRESETS[app.basePresetId].label}: </>}
            {rationale}
          </p>
        )}
      </div>

      <fieldset className="sliders">
        <legend>Criterion weights</legend>
        <p className="hint">0 = ignore · 5 = most important. The ranking updates as you drag.</p>
        {data.features.map((f) => {
          const w = app.weights[f.id] || 0
          const inputId = `w-${f.id}`
          const noData = avail?.byFeature[f.id] || null
          const scale = featureScaleText(f)
          return (
            <div key={f.id} className={`slider${w === 0 ? ' slider--off' : ''}`}>
              <div className="slider__head">
                <label htmlFor={inputId}>{f.label}</label>
                {noData && (
                  <span
                    className="tag tag--nodata"
                    title={
                      noData === 'target'
                        ? 'The target has no value for this criterion, so its weight cannot change the ranking.'
                        : 'No candidate site has a value for this criterion yet, so its weight cannot change the ranking.'
                    }
                  >
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

      <button type="button" className="btn btn--ghost" onClick={app.resetWeights} disabled={atBase}>
        Reset to {PRESETS[app.basePresetId].label}
      </button>
    </div>
  )
}
