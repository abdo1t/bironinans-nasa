import { describe, expect, it } from 'vitest'
import { missionEmphasis, MISSION_ORDER } from './missions.js'
import { PRESETS } from './presets.js'
import { RANK_METHODS, RANK_ORDER } from './rankMethods.js'
import { entrySummary, guaranteedMin, hasOpenRange, keyDifferences, plainComparison, plainReliability } from './summary.js'

const features = [
  { id: 'terrain', label: 'Terrain relief', kind: 'numeric' },
  { id: 'aridity', label: 'Aridity', kind: 'numeric' },
  { id: 'geology', label: 'Geology match', kind: 'categorical', related: { basalt: ['anorthosite'] } },
  { id: 'ice', label: 'Ground ice / permafrost', kind: 'categorical' },
]
const target = { norm: { terrain: 0.2, aridity: 1, geology: 'basalt', ice: 'no' } }
const site = (id, norm) => ({ id, name: id.toUpperCase(), norm })

describe('guaranteedMin / hasOpenRange / entrySummary', () => {
  it('uses the low end of the range, the score when nothing is missing, null when unscored', () => {
    expect(guaranteedMin({ score: 70, scoreRange: [55, 80] })).toBe(55)
    expect(guaranteedMin({ score: 70, scoreRange: [70, 70] })).toBe(70)
    expect(guaranteedMin({ score: 70 })).toBe(70)
    expect(guaranteedMin({ score: null, scoreRange: null })).toBeNull()
    expect(guaranteedMin(undefined)).toBeNull()
  })

  it('treats a score of 0 as a real score, not as unscored', () => {
    expect(guaranteedMin({ score: 0, scoreRange: [0, 0] })).toBe(0)
    expect(entrySummary({ score: 0, scoreRange: [0, 0], why: [], gap: 'Much wetter than the target' }).scored).toBe(true)
  })

  it('flags an open range only when the ends differ', () => {
    expect(hasOpenRange({ scoreRange: [55, 80] })).toBe(true)
    expect(hasOpenRange({ scoreRange: [70, 70] })).toBe(false)
    expect(hasOpenRange({ scoreRange: null })).toBe(false)
  })

  it('summarises a scored entry and an unscored one', () => {
    const s = entrySummary({
      score: 82,
      scoreRange: [60, 87],
      why: ['Strongest match: aridity', 'Bare ground close to target'],
      gap: 'Much warmer than the target',
    })
    expect(s).toEqual({
      scored: true,
      score: 82,
      min: 60,
      max: 87,
      hasRange: true,
      match: 'aridity',
      short: 'Much warmer than the target',
    })
    const none = entrySummary({
      score: null,
      scoreRange: null,
      why: [],
      gap: 'Insufficient data: 2 of 6 selected criteria have data (minimum 3)',
    })
    expect(none.scored).toBe(false)
    expect(none.min).toBeNull()
    expect(none.short).toMatch(/^Insufficient data/)
  })
})

describe('keyDifferences', () => {
  const weights = { terrain: 5, aridity: 3, geology: 3, ice: 0 }
  const a = site('a', { terrain: 0.2, aridity: 0.9, geology: 'basalt', ice: 'no' })
  const b = site('b', { terrain: 0.8, aridity: 0.95, geology: 'clay', ice: 'yes' })
  const c = site('c', { terrain: null, aridity: 0.5, geology: 'anorthosite', ice: 'no' })

  it('orders by weight × spread and names the closest and furthest site', () => {
    const { differences } = keyDifferences([a, b], target, features, weights)
    expect(differences.map((d) => d.feature.id)).toEqual(['terrain', 'geology'])
    expect(differences[0].best.site.id).toBe('a')
    expect(differences[0].worst.site.id).toBe('b')
    expect(differences[0].spread).toBeCloseTo(0.6)
  })

  it('skips unselected criteria and criteria below the spread threshold', () => {
    const { differences } = keyDifferences([a, b], target, features, weights)
    expect(differences.some((d) => d.feature.id === 'ice')).toBe(false) // weight 0
    expect(differences.some((d) => d.feature.id === 'aridity')).toBe(false) // spread 0.05
  })

  it('never treats a missing value as zero: lists it as not comparable', () => {
    const { differences, notComparable } = keyDifferences([a, c], target, features, weights)
    expect(differences.some((d) => d.feature.id === 'terrain')).toBe(false)
    expect(notComparable).toEqual([{ feature: features[0], missing: [c] }])
  })

  it('with three sites still compares the two that have data', () => {
    const { differences, notComparable } = keyDifferences([a, b, c], target, features, weights)
    const terrain = differences.find((d) => d.feature.id === 'terrain')
    expect(terrain.best.site.id).toBe('a')
    expect(terrain.worst.site.id).toBe('b')
    expect(notComparable[0].missing).toEqual([c])
  })

  it('respects the limit', () => {
    expect(keyDifferences([a, b, c], target, features, weights, { limit: 1 }).differences).toHaveLength(1)
  })
})

describe('missions and rank methods (labels only)', () => {
  const all = ['terrain', 'aridity', 'temp', 'temp_range', 'veg', 'geology', 'ice'].map((id) => ({ id, label: id }))

  it('every mission is an existing preset', () => {
    expect(MISSION_ORDER.length).toBe(Object.keys(PRESETS).length)
    for (const id of MISSION_ORDER) expect(PRESETS[id]).toBeTruthy()
  })

  it('emphasis lists the top-weighted criteria of the preset, heaviest first', () => {
    expect(missionEmphasis('rover', all)).toEqual(['terrain', 'veg'])
    expect(missionEmphasis('ice', all)).toEqual(['temp', 'ice'])
    expect(missionEmphasis('habitat', all)).toEqual(['geology'])
    expect(missionEmphasis('balanced', all, 5)).toEqual(['terrain', 'aridity', 'temp', 'veg', 'geology'])
    expect(missionEmphasis('nope', all)).toEqual([])
  })

  it('rank methods cover exactly the two URL values', () => {
    expect(RANK_ORDER).toEqual(['score', 'min'])
    for (const id of RANK_ORDER) expect(RANK_METHODS[id].label).toBeTruthy()
  })
})

describe('plainReliability', () => {
  it('says when missing data cannot move the score', () => {
    expect(plainReliability({ score: 80, coverage: { used: 6, selected: 6 }, scoreRange: [80, 80] })).toMatch(
      /all 6 selected measurements/,
    )
  })
  it('gives the possible range when site data is missing', () => {
    const text = plainReliability({ score: 95, coverage: { used: 4, selected: 7 }, scoreRange: [56, 97] })
    expect(text).toMatch(/4 of 7 measurements/)
    expect(text).toMatch(/from 56 to 97/)
  })
  it('explains criteria left out on the target side', () => {
    expect(plainReliability({ score: 70, coverage: { used: 5, selected: 6 }, scoreRange: [70, 70] })).toMatch(
      /no value for the Moon\/Mars site/,
    )
  })
  it('calls an unscored site missing data, not a poor match', () => {
    const text = plainReliability({ score: null, coverage: { used: 2, selected: 6 }, scoreRange: null }, 3)
    expect(text).toMatch(/at least 3 are needed/)
    expect(text).toMatch(/not a poor match/)
  })
})

describe('plainComparison', () => {
  const A = { name: 'A' }
  const B = { name: 'B' }
  const C = { name: 'C' }
  it('flags a leader that rests on fewer measurements', () => {
    const lines = plainComparison(
      [A, B],
      [
        { score: 95, coverage: { used: 4, selected: 7 } },
        { score: 64, coverage: { used: 7, selected: 7 } },
      ],
    )
    expect(lines[0]).toBe('A is the closest match (95/100 vs 64/100 for B).')
    expect(lines[1]).toMatch(/fewer measurements \(4 of 7\) than B \(7 of 7\)/)
    expect(lines.at(-1)).toMatch(/none of these places is confirmed as suitable/)
  })
  it('says when the leader has complete data, and names unscored sites as missing data', () => {
    const lines = plainComparison(
      [A, B, C],
      [
        { score: 80, coverage: { used: 6, selected: 6 } },
        { score: 70, coverage: { used: 6, selected: 6 } },
        { score: null, coverage: { used: 1, selected: 6 } },
      ],
    )
    expect(lines[1]).toBe('Its result rests on all 6 selected measurements.')
    expect(lines[2]).toMatch(/C could not be scored.*not a poor match/)
  })
  it('handles ties', () => {
    const lines = plainComparison(
      [A, B],
      [
        { score: 70, coverage: { used: 6, selected: 6 } },
        { score: 70, coverage: { used: 6, selected: 6 } },
      ],
    )
    expect(lines[0]).toBe('A and B match equally closely (70/100).')
  })
})
