import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets.js'
import { biggestMovers, explainScoreChange, leadersByObjective, rankShift, rankWith, signed, weightChanges } from './rankShift.js'
import { scoreSite } from './scoring.js'

const features = [
  { id: 'a', label: 'A', kind: 'numeric' },
  { id: 'b', label: 'B', kind: 'numeric' },
  { id: 'c', label: 'C', kind: 'numeric' },
]
const target = { id: 't', norm: { a: 1, b: 0, c: 0.5 } }
const sites = [
  { id: 'x', name: 'X', norm: { a: 1, b: 1, c: 0.5 } }, // great on a, bad on b
  { id: 'y', name: 'Y', norm: { a: 0, b: 0, c: 0.5 } }, // bad on a, great on b
  { id: 'z', name: 'Z', norm: { a: 0.5, b: null, c: null } }, // too little data with minCriteria 3
]
const siteById = Object.fromEntries(sites.map((s) => [s.id, s]))

describe('rankWith', () => {
  it('numbers scored places and leaves unscored ones null', () => {
    const r = rankWith(target, sites, { a: 1, b: 1, c: 1 }, features, 3, 'score', siteById)
    expect(r.map((e) => [e.site, e.rank])).toEqual([
      ['x', 1],
      ['y', 2],
      ['z', null],
    ])
  })
})

describe('rankShift', () => {
  it('reports previous and current rank, rank delta and score delta from the same engine', () => {
    const before = rankWith(target, sites, { a: 5, b: 1, c: 1 }, features, 3, 'score', siteById)
    const after = rankWith(target, sites, { a: 1, b: 5, c: 1 }, features, 3, 'score', siteById)
    const s = rankShift(before, after)
    expect(s.y).toMatchObject({ prevRank: 2, rank: 1, delta: 1, status: 'up' })
    expect(s.x).toMatchObject({ prevRank: 1, rank: 2, delta: -1, status: 'down' })
    expect(s.y.scoreDelta).toBe(s.y.score - s.y.prevScore)
    expect(s.z.status).toBe('none')
  })

  it('reports the change of the conservative lower bound separately from the score change', () => {
    const s = rankShift([{ site: 'a', rank: 1, score: 80, scoreRange: [60, 90] }], [{ site: 'a', rank: 1, score: 78, scoreRange: [70, 85] }])
    expect(s.a).toMatchObject({ scoreDelta: -2, minDelta: 10 })
  })

  it('marks places that enter or drop out of the scored set', () => {
    const s = rankShift([{ site: 'q', rank: null, score: null }, { site: 'p', rank: 1, score: 50 }], [
      { site: 'q', rank: 1, score: 40 },
      { site: 'p', rank: null, score: null },
    ])
    expect(s.q.status).toBe('entered')
    expect(s.p.status).toBe('dropped')
    expect(s.q.scoreDelta).toBeNull()
  })
})

describe('weightChanges / signed', () => {
  it('lists only changed criteria in feature order', () => {
    expect(weightChanges({ a: 1, b: 2, c: 3 }, { a: 1, b: 0, c: 5 }, features)).toEqual([
      { id: 'b', label: 'B', from: 2, to: 0 },
      { id: 'c', label: 'C', from: 3, to: 5 },
    ])
  })
  it('formats signs with a real minus', () => {
    expect([signed(3), signed(-2), signed(0), signed(null)]).toEqual(['+3', '−2', '±0', ''])
  })
})

describe('explainScoreChange', () => {
  it('measures each weight change alone with scoreSite and totals the real change', () => {
    const from = { a: 5, b: 1, c: 1 }
    const to = { a: 1, b: 5, c: 1 }
    const e = explainScoreChange(target, sites[0], from, to, features, 3)
    const base = scoreSite(target, sites[0], from, features, 3).score
    expect(e.total).toBe(scoreSite(target, sites[0], to, features, 3).score - base)
    expect(e.items.find((i) => i.id === 'a').effect).toBe(scoreSite(target, sites[0], { ...from, a: 1 }, features, 3).score - base)
    expect(e.items.find((i) => i.id === 'a').sim).toBe(1)
    expect(e.items.find((i) => i.id === 'b').sim).toBe(0)
  })

  it('never invents an effect for a site without a score, and flags missing data', () => {
    const e = explainScoreChange(target, sites[2], { a: 1, b: 1, c: 1 }, { a: 1, b: 3, c: 1 }, features, 3)
    expect(e.total).toBeNull()
    expect(e.items[0]).toMatchObject({ id: 'b', effect: null, sim: null, siteHasData: false })
  })
})

describe('biggestMovers', () => {
  it('orders by |rank delta| and ignores unmoved places', () => {
    const m = biggestMovers({
      a: { delta: 1, scoreDelta: 2, rank: 1 },
      b: { delta: -3, scoreDelta: -5, rank: 4 },
      c: { delta: 0, scoreDelta: 0, rank: 2 },
      d: { delta: null, rank: null },
    })
    expect(m.map((x) => x.site)).toEqual(['b', 'a'])
  })
})

describe('leadersByObjective', () => {
  it('ranks once per preset in the requested order', () => {
    const feats = ['terrain', 'aridity', 'temp', 'temp_range', 'veg', 'geology', 'ice'].map((id) => ({ id, label: id, kind: 'numeric' }))
    const t = { id: 't', norm: Object.fromEntries(feats.map((f) => [f.id, 0.5])) }
    const s = [{ id: 's1', name: 'S1', norm: Object.fromEntries(feats.map((f) => [f.id, 0.4])) }]
    const out = leadersByObjective(t, s, feats, 3, 'score', { s1: s[0] }, PRESETS, ['rover', 'ice'])
    expect(out.map((o) => o.presetId)).toEqual(['rover', 'ice'])
    expect(out[0].top[0]).toMatchObject({ site: 's1', rank: 1, score: 90 })
  })
})
