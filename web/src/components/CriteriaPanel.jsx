import { useBundle } from '../data/useBundle.js'
import { dataAvailability, featureScaleText } from '../lib/explain.js'
import { PRESETS, WEIGHT_MAX, WEIGHT_MIN } from '../lib/presets.js'
import { RANK_METHODS, RANK_ORDER } from '../lib/rankMethods.js'
import { weightsEqual } from '../lib/urlState.js'
import { useAppState } from '../state/AppState.jsx'
import Disclosure from './Disclosure.jsx'
import MissionPicker from './MissionPicker.jsx'
import TargetSelect from './TargetSelect.jsx'
import Term from './Term.jsx'

/**
 * Explore side panel. Quick: reference site + research objective (a weight preset).
 * Advanced (collapsed by default): one weight slider per criterion. Both drive the
 * same weights in AppState, so there is a single scoring system.
 */
export default function CriteriaPanel({ advancedOpen = false, onAdvancedToggle, rankBy, onRankBy }) {
  const { data } = useBundle()
  const app = useAppState()
  const atBase = weightsEqual(app.weights, PRESETS[app.basePresetId].weights, data.features)
  const avail = app.target ? dataAvailability(app.target, data.sites, app.weights, data.features) : null
  const rationale = PRESETS[app.isCustom ? app.basePresetId : app.presetId]?.rationale

  return (
    <div className="criteria">
      <TargetSelect
        id="criteria-target"
        label="Compared with"
        targets={data.targets}
        value={app.targetId}
        onChange={app.setTarget}
      />

      <MissionPicker
        name="criteria-mission"
        legend="Research objective"
        value={app.presetId}
        onChange={app.setPreset}
        features={data.features}
        compact
      />
      {app.isCustom && (
        <p className="criteria__custom" role="status">
          {/* A shared link stores the weights, not the mission they started from, so name only the reset target. */}
          <strong>Custom weights</strong> are active.{' '}
          <button type="button" className="link-btn" onClick={app.resetWeights}>
            Reset to {PRESETS[app.basePresetId].label}
          </button>
        </p>
      )}
      {rationale && (
        <p id="criteria-preset-why" className="preset-why">
          {rationale}
        </p>
      )}
      <p className="preset-why preset-why--caveat">
        An objective only changes what counts most. A high score means resemblance, not mission suitability.
      </p>

      {!advancedOpen && <p className="criteria__more">Want more control? Open Advanced options.</p>}
      <Disclosure
        className="disclosure--flush criteria__advanced"
        title="Advanced options"
        hint={app.isCustom ? 'custom weights active' : 'ranking order and weights'}
        open={advancedOpen}
        onToggle={onAdvancedToggle}
      >
        {onRankBy && (
          <fieldset className="rankby-choice">
            <legend>
              <Term id="rankBy">Order places by</Term>
            </legend>
            {RANK_ORDER.map((id) => (
              <label key={id} className="rankby-choice__opt">
                <input type="radio" name="rank-by" value={id} checked={rankBy === id} onChange={() => onRankBy(id)} />
                <span>
                  <strong>{id === 'min' ? 'Most complete evidence first' : 'Best match first'}</strong>{' '}
                  <span className="muted">({RANK_METHODS[id].label})</span>
                  <span className="rankby-choice__help">{RANK_METHODS[id].help}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <fieldset className="sliders">
          <legend className="sliders__legend">Criterion weights</legend>
          <p className="hint">
            <Term id="weight">0 = ignore · 5 = most important.</Term> The ranking updates as you drag.
          </p>
          {data.features.map((f) => {
            const w = app.weights[f.id] || 0
            const inputId = `w-${f.id}`
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
      </Disclosure>
    </div>
  )
}
