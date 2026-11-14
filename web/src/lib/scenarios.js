// Mission scenarios: a target + preset pair with a plain-language brief.
// A scenario frames a screening question; it never claims a site is suitable.
export const SCENARIO_LIMITATION =
  'Screening aid: compares 10 km-scale relief, climate and geology — not rover-scale slopes, rocks or soil strength; ' +
  'field reconnaissance and engineering assessment still required.'

export const SCENARIOS = [
  {
    id: 'jezero-rover',
    label: 'Mars rover mobility testing — Jezero',
    targetId: 'mars-jezero',
    presetId: 'rover',
    screening:
      'Earth places to shortlist for rehearsing rover driving and navigation in conditions resembling the Jezero crater floor.',
    carriedBy: ['terrain', 'veg', 'aridity', 'geology'],
    // A planner shortlisting test sites needs evidence-backed candidates, so this
    // scenario ranks by the guaranteed minimum (score if missing criteria were mismatches).
    rankBy: 'min',
  },
  {
    id: 'moon-south-pole-ice',
    label: 'Lunar south pole ice prospecting',
    targetId: 'moon-south-pole',
    presetId: 'ice',
    screening:
      'Earth places to shortlist for rehearsing ice prospecting and drilling in cold, frozen ground resembling the lunar south polar region.',
    carriedBy: ['temp', 'ice'],
  },
]

/** The scenario whose target and preset both match, or null. */
export function matchScenario(targetId, presetId) {
  return SCENARIOS.find((s) => s.targetId === targetId && s.presetId === presetId) || null
}

/** Link query for a scenario (list view). */
export function scenarioQuery(s) {
  return { target: s.targetId, preset: s.presetId, view: 'list', ...(s.rankBy === 'min' ? { rank: 'min' } : {}) }
}
