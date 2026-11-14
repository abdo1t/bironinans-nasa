import { joinLabels } from '../lib/explain.js'
import { MISSIONS, MISSION_ORDER, missionEmphasis, missionTitle } from '../lib/missions.js'

/**
 * Research objective = weight preset, as a radio group of cards (native radios, so
 * arrow keys and screen readers work). `value` may be 'custom' (no card selected).
 * `compact` drops the question line for the Explore side panel.
 */
export default function MissionPicker({ name, value, onChange, features, legend = 'Research objective', compact = false }) {
  return (
    <fieldset className={`missions${compact ? ' missions--compact' : ''}`}>
      <legend className="missions__legend">{legend}</legend>
      <div className="missions__grid">
        {MISSION_ORDER.map((id) => {
          const emphasis = missionEmphasis(id, features)
          return (
            <label key={id} className={`mission${value === id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                className="mission__input"
                name={name}
                value={id}
                checked={value === id}
                onChange={() => onChange(id)}
              />
              <span className="mission__title">{missionTitle(id)}</span>
              {!compact && <span className="mission__q">{MISSIONS[id].question}</span>}
              {emphasis.length > 0 && (
                <span className="mission__emph">Emphasises {joinLabels(emphasis).toLowerCase()}</span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
