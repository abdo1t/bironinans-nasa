import { useBundle } from '../data/useBundle.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS, RANK_ORDER } from '../lib/rankMethods.js'
import { useAppState } from '../state/AppState.jsx'
import Disclosure from './Disclosure.jsx'
import MissionPicker from './MissionPicker.jsx'
import TargetSelect from './TargetSelect.jsx'
import WeightSliders from './WeightSliders.jsx'
import Term from './Term.jsx'

/**
 * Explore side panel. Quick: reference site + research objective (a weight preset).
 * Advanced (collapsed by default): one weight slider per criterion. Both drive the
 * same weights in AppState, so there is a single scoring system.
 */
export default function CriteriaPanel({ advancedOpen = false, onAdvancedToggle, rankBy, onRankBy }) {
  const { data } = useBundle()
  const app = useAppState()
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
        <WeightSliders idPrefix="w" />
      </Disclosure>
    </div>
  )
}
