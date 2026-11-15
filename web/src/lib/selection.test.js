import { describe, expect, it } from 'vitest'
import { criteriaSummary, missionShortName, selectionParts, siteMissing, targetShortName, topReason } from './selection.js'

const features = [
  { id: 'terrain', label: 'Terrain relief', kind: 'numeric' },
  { id: 'temp', label: 'Surface temperature', kind: 'numeric' },
  { id: 'ice', label: 'Ground ice / permafrost', kind: 'categorical' },
]
const target = {
  id: 'moon-south-pole',
  body: 'moon',
  name: 'Lunar South Pole — Shackleton–de Gerlache connecting ridge (Artemis)',
  norm: { terrain: 0.9, temp: 0, ice: 'yes' },
  provenance: { ice: { status: 'literature', display: 'Water ice in cold traps (literature)' } },
}
const site = {
  id: 's',
  norm: { terrain: 0.1, temp: 0.2, ice: 'yes' },
  provenance: { ice: { status: 'literature', value: 'yes' } },
}

describe('selection labels', () => {
  it('reads the supplied deep link as Moon · South Pole · Ice Exploration', () => {
    expect(selectionParts(target, 'ice', false)).toEqual(['Moon', 'South Pole', 'Ice Exploration'])
  })
  it('keeps names without a world prefix and names custom weights', () => {
    expect(targetShortName({ name: 'Jezero Crater — Perseverance landing site' })).toBe('Jezero Crater')
    expect(missionShortName('custom', true)).toBe('Custom Weights')
    expect(missionShortName('custom', true, 'ice')).toBe('Ice Exploration (custom criteria)')
    expect(selectionParts(null, 'ice', false)).toEqual([])
  })
})

describe('topReason', () => {
  it('picks the qualifying criterion earning the most points, with values and evidence', () => {
    const r = topReason(site, target, { terrain: 2, temp: 5, ice: 5 }, features)
    // temp: sim 0.8 × 5 = 4.0 < ice: 1 × 5 = 5; terrain sim 0.2 is under the 70% threshold
    expect(r.feature.id).toBe('ice')
    expect(r.siteText).toBe('yes')
    expect(r.targetText).toBe('Water ice in cold traps') // trailing method note trimmed
    expect(r.evidence).toBe('Literature')
  })
  it('ignores criteria with weight 0 or missing data, and returns null when none qualify', () => {
    expect(topReason(site, target, { terrain: 5, temp: 0, ice: 0 }, features)).toBeNull()
    expect(topReason({ ...site, norm: { ...site.norm, ice: null } }, target, { ice: 5 }, features)).toBeNull()
  })
})

describe('criteriaSummary', () => {
  it('lists used criteria by importance (ties in feature order) and the ones switched off', () => {
    const { used, off } = criteriaSummary({ terrain: 2, temp: 5, ice: 5 }, features)
    expect(used.map((c) => [c.feature.id, c.weight])).toEqual([['temp', 5], ['ice', 5], ['terrain', 2]])
    expect(off).toEqual([])
    expect(criteriaSummary({ temp: 3 }, features).off.map((f) => f.id)).toEqual(['terrain', 'ice'])
  })
})

describe('siteMissing', () => {
  it('names selected criteria the place lacks, but not ones the target lacks or that are off', () => {
    const gappy = { ...site, norm: { terrain: null, temp: 0.2, ice: null } }
    const t = { ...target, norm: { ...target.norm, ice: null } }
    expect(siteMissing(gappy, t, { terrain: 2, temp: 5, ice: 5 }, features).map((f) => f.id)).toEqual(['terrain'])
    expect(siteMissing(gappy, t, { terrain: 0, temp: 5, ice: 5 }, features)).toEqual([])
  })
})
