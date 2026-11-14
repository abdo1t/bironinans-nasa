import { describe, expect, it } from 'vitest'
import {
  orderRanking,
  availabilityNotice,
  bundleUsesDataset,
  dataAvailability,
  evidenceCoverage,
  featureScaleText,
  featuresMissingEverywhere,
  joinLabels,
  linkifyCitation,
  pointsLost,
  scoreRangeText,
  shortDate,
  usableWeightFromSims,
  whyGapSummary,
} from './explain.js'
import { NO_GAP, scoreSite } from './scoring.js'
import { compareVerdict } from './verdict.js'
import { SCENARIOS, matchScenario, scenarioQuery } from './scenarios.js'
import { PRESETS } from './presets.js'

const features = [
  { id: 'terrain', label: 'Terrain relief', kind: 'numeric', unit: 'm (P99 − P1)', earthMin: 0, earthMax: 1500, invert: false },
  { id: 'aridity', label: 'Aridity', kind: 'numeric', unit: 'mm/yr precipitation (inverted)', earthMin: 0, earthMax: 2000, invert: true },
  { id: 'temp', label: 'Surface temperature', kind: 'numeric', unit: '°C annual mean', earthMin: -60, earthMax: 35 },
  { id: 'veg', label: 'Bare ground', kind: 'numeric', unit: 'NDVI (inverted)', earthMin: 0, earthMax: 0.8, invert: true },
  { id: 'geology', label: 'Geology match', kind: 'categorical', related: { basalt: ['anorthosite'] } },
]
const target = { id: 't', norm: { terrain: null, aridity: 1, temp: 0.1, veg: 1, geology: 'basalt' } }
const siteA = { id: 'a', name: 'Alpha', norm: { terrain: null, aridity: 0.9, temp: 0.2, veg: null, geology: 'basalt' } }
const siteB = { id: 'b', name: 'Beta', norm: { terrain: null, aridity: 0.5, temp: 0.6, veg: null, geology: 'clay' } }
const weights = { terrain: 5, aridity: 3, temp: 1, veg: 4, geology: 3 }

describe('dataAvailability / availabilityNotice', () => {
  it('flags criteria missing on the target or on every site, with weight share', () => {
    const av = dataAvailability(target, [siteA, siteB], weights, features)
    expect(av.byFeature).toEqual({ terrain: 'target', aridity: null, temp: null, veg: 'sites', geology: null })
    expect(av.missingWeight).toBe(9)
    expect(av.totalWeight).toBe(16)
    expect(availabilityNotice(av)).toBe(
      'Terrain relief & Bare ground — 9 of 16 weight points — have no data for this target or its sites: the ranking uses the other criteria only.',
    )
  })

  it('ignores unselected criteria in the weight sums and returns null when all have data', () => {
    const av = dataAvailability(target, [siteA], { aridity: 2, temp: 1, terrain: 0 }, features)
    expect(av.missing).toEqual([])
    expect(av.totalWeight).toBe(3)
    expect(availabilityNotice(av)).toBeNull()
  })

  it('joins labels', () => {
    expect(joinLabels(['A'])).toBe('A')
    expect(joinLabels(['A', 'B', 'C'])).toBe('A, B & C')
  })
})

describe('evidenceCoverage (weight share)', () => {
  it('uses weights, not criterion counts', () => {
    // A: aridity 3 + temp 1 + geology 3 = 7 of 16 → 0.4375 → low
    const ev = evidenceCoverage(target, siteA, weights, features)
    expect(ev).toMatchObject({ usedWeight: 7, selectedWeight: 16, used: 3, selected: 5, level: 'low' })
  })
  it('medium below 80 %, high otherwise; low under 3 criteria', () => {
    expect(evidenceCoverage(target, siteA, { aridity: 3, temp: 1, geology: 3, veg: 1 }, features).level).toBe('high') // 7/8
    expect(evidenceCoverage(target, siteA, { aridity: 3, temp: 1, geology: 3, veg: 3 }, features).level).toBe('medium') // 7/10
    expect(evidenceCoverage(target, siteA, { aridity: 3, temp: 1 }, features).level).toBe('low') // 2 criteria
    expect(evidenceCoverage(target, siteA, { terrain: 3 }, features).level).toBeNull()
  })
})

describe('scoreRangeText', () => {
  it('shows a range only when lo != hi', () => {
    expect(scoreRangeText(68, [49, 77])).toBe('range 49–77')
    expect(scoreRangeText(68, [68, 68])).toBeNull()
    expect(scoreRangeText(null, null)).toBeNull()
    expect(scoreRangeText(50, undefined)).toBeNull()
  })
})

describe('pointsLost', () => {
  it('score + all points lost = 100', () => {
    const r = scoreSite(target, siteA, weights, features)
    const usable = usableWeightFromSims(r.sims, weights)
    expect(usable).toBe(7)
    let lost = 0
    for (const f of features) lost += pointsLost(weights[f.id], r.sims[f.id], usable) ?? 0
    expect(lost + (100 * (3 * 0.9 + 1 * 0.9 + 3 * 1)) / 7).toBeCloseTo(100, 10)
    expect(pointsLost(3, 0.9, 7)).toBeCloseTo(30 / 7, 10)
    expect(pointsLost(0, 0.5, 7)).toBeNull()
    expect(pointsLost(3, null, 7)).toBeNull()
  })
})

describe('whyGapSummary', () => {
  it('strips the "Strongest match" prefix and drops NO_GAP', () => {
    expect(whyGapSummary(['Strongest match: aridity', 'x'], 'Geology match: clay vs the target\'s basalt', 50)).toEqual({
      match: 'aridity',
      short: "Geology match: clay vs the target's basalt",
    })
    expect(whyGapSummary(['Strongest match: aridity'], NO_GAP, 90)).toEqual({ match: 'aridity', short: null })
    expect(whyGapSummary([], 'Insufficient data', null)).toEqual({ match: null, short: 'Insufficient data' })
  })
})

describe('featureScaleText', () => {
  it('formats unit, bounds and inversion', () => {
    expect(featureScaleText(features[1])).toBe('mm/yr · Earth scale 0 to 2000 · inverted')
    expect(featureScaleText(features[2])).toBe('°C · Earth scale −60 to 35')
    expect(featureScaleText(features[4])).toBeNull()
  })
})

describe('linkifyCitation', () => {
  it('links DOIs and URLs and keeps trailing punctuation outside', () => {
    const segs = linkifyCitation('Smith 2010, GRL 37, doi:10.1029/2010GL043751. See https://example.org/a, ok')
    expect(segs).toEqual([
      { text: 'Smith 2010, GRL 37, ' },
      { text: 'doi:10.1029/2010GL043751', href: 'https://doi.org/10.1029/2010GL043751' },
      { text: '. See ' },
      { text: 'https://example.org/a', href: 'https://example.org/a' },
      { text: ', ok' },
    ])
  })
  it('keeps balanced parentheses inside a DOI and drops an unbalanced closing one', () => {
    expect(linkifyCitation('(doi:10.1016/S0012-821X(02)00027-1)')[1]).toEqual({
      text: 'doi:10.1016/S0012-821X(02)00027-1',
      href: 'https://doi.org/10.1016/S0012-821X(02)00027-1',
    })
  })
  it('handles text without links and empty input', () => {
    expect(linkifyCitation('Plain text')).toEqual([{ text: 'Plain text' }])
    expect(linkifyCitation('')).toEqual([])
  })
})

describe('bundle helpers', () => {
  it('featuresMissingEverywhere / bundleUsesDataset / shortDate', () => {
    expect(featuresMissingEverywhere([siteA, siteB], features).map((f) => f.id)).toEqual(['terrain', 'veg'])
    const s = { norm: { terrain: 0.3 }, provenance: { terrain: { dataset: 'Copernicus DEM GLO-30' } } }
    expect(bundleUsesDataset([s], 'terrain', 'Copernicus')).toBe(true)
    expect(bundleUsesDataset([s], 'terrain', 'copernicus')).toBe(false) // case-sensitive, whole word
    expect(bundleUsesDataset([s], 'terrain', 'NASADEM')).toBe(false)
    expect(bundleUsesDataset([{ norm: { terrain: null }, provenance: { terrain: { dataset: 'Copernicus' } } }], 'terrain', 'Copernicus')).toBe(false)
    expect(shortDate('2026-11-13T19:57:32+00:00')).toBe('2026-11-13')
    expect(shortDate('MOCK')).toBe('MOCK')
  })
})

describe('compareVerdict', () => {
  const rank = (sites, w) =>
    Object.fromEntries(sites.map((s) => [s.id, { ...scoreSite(target, s, w, features) }]))

  it('skips criteria with no data for every compared site and reports the best site range', () => {
    const sites = [siteA, siteB]
    const lines = compareVerdict(sites, target, features, weights, rank(sites, weights))
    const a = scoreSite(target, siteA, weights, features)
    expect(lines[0]).toBe(
      `Best overall: Alpha (${a.score}/100; range ${a.scoreRange[0]}–${a.scoreRange[1]} if its missing criteria were a total mismatch or a perfect match).`,
    )
    // top weight with data is aridity/geology (3), not terrain (5) or veg (4)
    expect(lines.some((l) => l.startsWith('Terrain relief (weight 5)'))).toBe(false)
    expect(lines.some((l) => l.startsWith('Aridity (weight 3): Alpha'))).toBe(true)
    expect(lines.some((l) => l.startsWith('Geology match (weight 3): Alpha'))).toBe(true)
    expect(lines).toContain('Not compared — no verified target value: Terrain relief.')
    expect(lines[lines.length - 1]).toBe('Not compared — no data for these sites: Bare ground.')
  })

  it('handles no scored sites', () => {
    const lines = compareVerdict([siteA], target, features, { terrain: 1 }, { a: { score: null, scoreRange: null } })
    expect(lines[0]).toBe('None of these sites can be scored yet — data pending.')
  })
})

describe('scenarios', () => {
  it('match target + preset and use existing presets', () => {
    for (const s of SCENARIOS) expect(PRESETS[s.presetId]).toBeDefined()
    expect(matchScenario('mars-jezero', 'rover').id).toBe('jezero-rover')
    expect(matchScenario('mars-jezero', 'balanced')).toBeNull()
    expect(scenarioQuery(SCENARIOS[1])).toEqual({ target: 'moon-south-pole', preset: 'ice', view: 'list' })
  })
  it('every preset has a rationale', () => {
    for (const p of Object.values(PRESETS)) expect(p.rationale.length).toBeGreaterThan(20)
  })
})

describe('orderRanking', () => {
  const entries = [
    { site: 'lanz', score: 95, scoreRange: [56, 97] },
    { site: 'holu', score: 76, scoreRange: [71, 77] },
    { site: 'ata', score: 64, scoreRange: [64, 64] },
    { site: 'none', score: null, scoreRange: null },
  ]
  const siteById = { lanz: { name: 'Lanzarote' }, holu: { name: 'Holuhraun' }, ata: { name: 'Atacama' }, none: { name: 'A' } }
  it('keeps scoring order for rankBy score', () => {
    expect(orderRanking(entries, 'score', siteById).map((e) => e.site)).toEqual(['lanz', 'holu', 'ata', 'none'])
  })
  it('orders by guaranteed minimum, unscored last', () => {
    expect(orderRanking(entries, 'min', siteById).map((e) => e.site)).toEqual(['holu', 'ata', 'lanz', 'none'])
  })
})
