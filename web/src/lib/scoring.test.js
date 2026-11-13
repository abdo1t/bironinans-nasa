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
    expect(r.contrib).not.toHaveProperty('temp_range')
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

  it('scores 0 when no criterion is usable', () => {
    const r = scoreSite(target['t-mars'], site.delta, { terrain: 5 }, features)
    expect(r).toMatchObject({ score: 0, contrib: {}, why: [] })
  })
})
