// Parity tests: same fixture as pipeline/tests/test_scoring.py.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets.js'
import { rankSites, roundHalfUp, scoreSite, similarity } from './scoring.js'

const fixture = JSON.parse(
  readFileSync(new URL('../../../pipeline/tests/fixture.json', import.meta.url), 'utf-8'),
)
const { features, weightSets, targets, sites, expected } = fixture
const target = Object.fromEntries(targets.map((t) => [t.id, t]))
const site = Object.fromEntries(sites.map((s) => [s.id, s]))
const geology = features.find((f) => f.id === 'geology')

describe('parity with pipeline/scoring.py', () => {
  for (const ws of Object.keys(weightSets)) {
    for (const t of targets) {
      it(`${ws} / ${t.id} matches the fixture exactly`, () => {
        expect(rankSites(t, sites, weightSets[ws], features)).toEqual(expected[ws][t.id])
      })
    }
  }

  it('balanced preset matches the fixture (and config.py)', () => {
    expect(PRESETS.balanced.weights).toEqual(weightSets.balanced)
  })
})

describe('hand-checked values', () => {
  it('rounds half up, not to even', () => {
    // (1*1.0 + 3*0.5) / 4 = 62.5 -> 63
    expect(scoreSite(target['t-moon'], site.charlie, weightSets.edge, features).score).toBe(63)
    expect(roundHalfUp(62.5)).toBe(63)
  })

  it('computes the balanced score and skips missing criteria', () => {
    const r = scoreSite(target['t-mars'], site.bravo, PRESETS.balanced.weights, features)
    expect(r.score).toBe(86)
    expect(r.contrib.temp_range).toBeNull()
    expect(r.coverage).toEqual({ used: 6, selected: 7 })
  })

  it('breaks score ties by name, not input order', () => {
    const ids = rankSites(target['t-mars'], sites, PRESETS.balanced.weights, features).map((r) => r.site)
    expect(ids.indexOf('bravo')).toBeLessThan(ids.indexOf('echo'))
  })

  it('handles categorical similarity in both directions', () => {
    expect(similarity(geology, 'clay', 'clay')).toBe(1)
    expect(similarity(geology, 'sedimentary', 'clay')).toBe(0.5)
    expect(similarity(geology, 'clay', 'sedimentary')).toBe(0.5)
    expect(similarity(geology, 'basalt', 'clay')).toBe(0)
    expect(similarity(geology, null, 'clay')).toBeNull()
  })

  it('gives a null score (not 0) when no selected criterion is usable', () => {
    const r = scoreSite(target['t-mars'], site.delta, { terrain: 5 }, features)
    expect(r).toEqual(
      expect.objectContaining({
        score: null,
        contrib: { terrain: null },
        sims: { terrain: null },
        coverage: { used: 0, selected: 1 },
        why: [],
      }),
    )
  })

  it('reports no criteria selected', () => {
    const r = scoreSite(target['t-mars'], site.alpha, {}, features)
    expect(r).toMatchObject({ score: null, coverage: { used: 0, selected: 0 }, gap: 'No criteria selected' })
  })
})

describe('independent hand-calculated cases (shared with pytest)', () => {
  for (const c of fixture.handCases) {
    it(c.name, () => {
      const r = scoreSite({ norm: c.target, clipped: c.clipped ?? {} }, { norm: c.site }, c.weights, features, c.minUsed ?? 1)
      for (const [key, value] of Object.entries(c.expect)) {
        expect(r[key], `${key}: ${c.working}`).toEqual(value)
      }
    })
  }

  for (const c of fixture.rankCases) {
    it(c.name, () => {
      const ranked = rankSites({ norm: c.target }, c.sites, c.weights, features, c.minUsed ?? 1)
      expect(ranked.map((r) => [r.site, r.score])).toEqual(c.expect)
    })
  }
})
