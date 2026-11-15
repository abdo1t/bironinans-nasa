import { missionLabel } from '../lib/missions.js'
import { PRESETS } from '../lib/presets.js'
import { RANK_METHODS, RANK_ORDER } from '../lib/rankMethods.js'
import { useAppState } from '../state/AppState.jsx'
import LiveRanking from './LiveRanking.jsx'
import Term from './Term.jsx'
import WeightSliders from './WeightSliders.jsx'

/**
 * Explore "Advanced options": everything that changes the ranking beyond the mission, in one
 * place — 1. the order (best match / most complete evidence), 2. one weight per criterion,
 * 3. reset to the mission's weights (inside WeightSliders). The world, site and mission
 * themselves live in the shared mission control (top bar), so there is one control for each.
 * Both edit the same weights in AppState: a single scoring system.
 */
export default function CriteriaPanel({ rankBy, onRankBy }) {
  const app = useAppState()
  const rationale = PRESETS[app.isCustom ? app.basePresetId : app.presetId]?.rationale

  return (
    <div className="criteria">
      <p className="criteria__mission">
        Mission: <strong>{missionLabel(app)}</strong>
        {app.isCustom && (
          <>
            {' '}
            · <span className="criteria__custom-tag">custom weights</span>
          </>
        )}
      </p>

      {onRankBy && (
        <fieldset className="rankby-choice adv-group">
          <legend className="adv-group__title">
            <span className="adv-group__num" aria-hidden="true">
              1
            </span>
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

      <div className="adv-group">
        <h3 className="adv-group__title">
          <span className="adv-group__num" aria-hidden="true">
            2
          </span>
          Criteria weights and reset
        </h3>
        <LiveRanking className="criteria__live" />
        <WeightSliders idPrefix="w" legend="Importance of each criterion" />
      </div>

      {rationale && (
        <p id="criteria-preset-why" className="preset-why">
          {rationale}
        </p>
      )}
      <p className="preset-why preset-why--caveat">
        A mission only changes what counts most. A high score means resemblance, not mission suitability.
      </p>
    </div>
  )
}
