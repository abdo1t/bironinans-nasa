import { describe, expect, it } from 'vitest'
import SITE_PREVIEWS from '../data/sitePreviews.json'
import TARGET_PREVIEWS from '../data/terrainPreviews.json'
import { SHARED_KM, cropOf, defaultCriterion, mirrorRows, mirrorTakeaway } from './mirror.js'

const features = [
  { id: 'terrain', label: 'Terrain relief', kind: 'numeric' },
  { id: 'temp', label: 'Surface temperature', kind: 'numeric' },
  { id: 'geology', label: 'Geology match', kind: 'categorical', related: { basalt: ['anorthosite'] } },
  { id: 'ice', label: 'Ground ice', kind: 'categorical' },
  { id: 'veg', label: 'Bare ground', kind: 'numeric' },
]
const target = { norm: { terrain: 0.15, temp: 0.08, geology: 'basalt', ice: 'no', veg: null } }
const site = { norm: { terrain: 0.11, temp: 0.59, geology: 'basalt', ice: null, veg: 0.98 } }
const weights = { terrain: 5, temp: 1, geology: 3, ice: 2, veg: 0 }

describe('mirrorRows', () => {
  const rows = Object.fromEntries(mirrorRows(target, site, weights, features).map((r) => [r.feature.id, r]))
  it('classifies match / differ with the 70% threshold', () => {
    expect(rows.terrain.status).toBe('match')
    expect(rows.terrain.sim).toBeCloseTo(0.96)
    expect(rows.temp.status).toBe('differ')
    expect(rows.geology.status).toBe('match')
  })
  it('keeps missing values missing and names the side', () => {
    expect(rows.ice.status).toBe('missing')
    expect(rows.ice.sim).toBeNull()
    expect(rows.ice.missingSide).toBe('site')
  })
  it('marks weight-0 criteria unused even when data is missing', () => {
    expect(rows.veg.status).toBe('unused')
    expect(rows.veg.missingSide).toBe('target')
  })
  it('opens the highest-weight match first', () => {
    expect(defaultCriterion(Object.values(rows))).toBe('terrain')
  })
})

describe('mirrorTakeaway', () => {
  it('picks the match earning most points, the difference losing most, and Earth-side gaps', () => {
    const t = mirrorTakeaway(mirrorRows(target, site, weights, features))
    // terrain 5 × 0.96 = 4.8 beats geology 3 × 1 = 3
    expect(t.match.feature.id).toBe('terrain')
    expect(t.differ.feature.id).toBe('temp')
    expect(t.siteMissing.map((r) => r.feature.id)).toEqual(['ice'])
  })
  it('returns nulls when there is nothing to point at', () => {
    const t = mirrorTakeaway([])
    expect(t.match).toBeNull()
    expect(t.differ).toBeNull()
    expect(t.siteMissing).toEqual([])
  })
})

describe('cropOf (shared ground scale)', () => {
  // Real preview entries: the Explore terrain panel and the Mirror crop both use this geometry.
  const previews = { ...TARGET_PREVIEWS, ...SITE_PREVIEWS }

  it('crops every preview to the same ground width as Jezero (no rescaling between worlds)', () => {
    for (const [id, entry] of Object.entries(previews)) {
      const c = cropOf(entry)
      expect(c.km, id).toBeCloseTo(SHARED_KM, 1)
    }
  })

  it('keeps the 10 km scoring square at 10 km after cropping', () => {
    for (const [id, entry] of Object.entries(previews)) {
      const c = cropOf(entry)
      const sideKm = (parseFloat(c.square.width) / 100) * c.km
      expect(sideKm, id).toBeCloseTo(entry.scoringWindowKm, 0)
    }
  })
})
