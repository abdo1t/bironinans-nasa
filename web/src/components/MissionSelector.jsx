import { useBundle } from '../data/useBundle.js'
import { bodyLabel } from '../lib/format.js'
import { MISSION_ORDER, missionLabel, missionTitle } from '../lib/missions.js'
import { useAppState } from '../state/AppState.jsx'

const WORLDS = ['moon', 'mars']

/**
 * The current search in one compact control: world (Moon / Mars), the Moon or Mars site and the
 * research objective (a weight preset). Used in the Home hero and in the navigation's mission
 * popover, so both edit the same AppState (and therefore the URL).
 *
 * Choosing a world selects its first site, so a selection is never left half-made; the site
 * list then offers the others. Custom weights appear as their own objective until a preset is
 * chosen (choosing one replaces them, as before).
 */
export default function MissionSelector({ idPrefix, layout = 'bar' }) {
  const { data } = useBundle()
  const app = useAppState()
  const body = app.target?.body ?? null
  const worldTargets = body ? data.targets.filter((t) => t.body === body) : []

  const chooseWorld = (b) => {
    if (app.target?.body === b) return
    const first = data.targets.find((t) => t.body === b)
    if (first) app.setTarget(first.id)
  }

  return (
    <div className={`mselect mselect--${layout}`}>
      <div className="mselect__field mselect__field--world">
        <span className="mselect__label" id={`${idPrefix}-world-label`}>
          World
        </span>
        <div className="mselect__worlds" role="group" aria-labelledby={`${idPrefix}-world-label`}>
          {WORLDS.map((b) => {
            const count = data.targets.filter((t) => t.body === b).length
            return (
              <button
                key={b}
                type="button"
                className={`mselect__world mselect__world--${b}`}
                aria-pressed={body === b}
                disabled={!count}
                onClick={() => chooseWorld(b)}
              >
                <span className={`world-dot world-dot--${b}`} aria-hidden="true" />
                {bodyLabel(b)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mselect__field">
        <label className="mselect__label" htmlFor={`${idPrefix}-target`}>
          {body ? `${bodyLabel(body)} site` : 'Site'}
        </label>
        <select
          id={`${idPrefix}-target`}
          className="mselect__select"
          value={app.targetId || ''}
          disabled={!body}
          onChange={(e) => app.setTarget(e.target.value || null)}
        >
          {!body && <option value="">Choose a world first</option>}
          {worldTargets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name.split(' — ')[0]}
            </option>
          ))}
        </select>
      </div>

      <div className="mselect__field">
        <label className="mselect__label" htmlFor={`${idPrefix}-mission`}>
          Mission
        </label>
        <select
          id={`${idPrefix}-mission`}
          className="mselect__select"
          value={app.isCustom ? 'custom' : app.presetId}
          onChange={(e) => e.target.value !== 'custom' && app.setPreset(e.target.value)}
        >
          {app.isCustom && <option value="custom">{missionLabel(app)}</option>}
          {MISSION_ORDER.map((id) => (
            <option key={id} value={id}>
              {missionTitle(id)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
