import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  defaultTargetId,
  fmtRange,
  fmtScore,
  fmtValue,
  resultsFor,
  statusReason,
  testsForTarget,
  validateMethodV1,
} from './methodV1.js'

const d = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/method-v1/analog_results.json', import.meta.url)), 'utf8'))

describe('analog_results.json (method v1)', () => {
  it('passes the structural check', () => {
    expect(validateMethodV1(d)).toEqual([])
    expect(d.meta.ranking_allowed).toBe(false)
  })

  it('offers only mission tests for the target body (thermal is Moon-only)', () => {
    expect(testsForTarget(d, 'mars_jezero').map((m) => m.id)).not.toContain('thermal_environment')
    expect(testsForTarget(d, 'moon_south_polar_region').map((m) => m.id)).toContain('thermal_environment')
  })

  it('orders scored results by score inside one test, unscored after, without inventing scores', () => {
    for (const t of d.targets) {
      for (const m of testsForTarget(d, t.id)) {
        const rows = resultsFor(d, t.id, m.id)
        expect(rows.length).toBe(Object.keys(d.earth_sites).length)
        const scores = rows.filter((r) => r.status === 'scored').map((r) => r.score)
        expect(scores).toEqual([...scores].sort((a, b) => b - a))
        const firstUnscored = rows.findIndex((r) => r.status !== 'scored')
        if (firstUnscored >= 0) expect(rows.slice(firstUnscored).every((r) => r.status !== 'scored' && r.score === null)).toBe(true)
      }
    }
  })

  it('explains the damaged Arcadia DTM instead of a score', () => {
    const r = resultsFor(d, 'mars_arcadia', 'rover_mobility')[0]
    expect(r.status).toBe('target_data_unavailable')
    expect(statusReason(r, d.meta)).toBe('Terrain data unavailable — DTM file damaged, re-download required')
    expect(statusReason(r, d.meta, 'ar')).toMatch(/DTM/)
  })

  it('keeps the negative control in every test and marks it', () => {
    const neg = d.results.filter((r) => r.negative_control)
    expect(neg.length).toBeGreaterThan(0)
    expect(neg.every((r) => r.site_id === 'amazon_negative_control')).toBe(true)
  })

  it('every scored result carries a range and a confidence', () => {
    for (const r of d.results.filter((x) => x.status === 'scored')) {
      expect(fmtRange(r.score_range)).not.toBeNull()
      expect(['medium', 'low']).toContain(r.confidence)
    }
  })
})

describe('formatting never turns missing into zero', () => {
  it('returns null for missing values', () => {
    expect(fmtValue(null, 'deg')).toBeNull()
    expect(fmtValue(undefined, 'm')).toBeNull()
    expect(fmtScore(null)).toBeNull()
    expect(fmtRange(null)).toBeNull()
  })
  it('formats units', () => {
    expect(fmtValue(4.0328, 'deg')).toBe('4.03°')
    expect(fmtValue(0.114688, 'fraction')).toBe('11.5%')
    expect(fmtValue(124.2, 'K')).toBe('124 K')
    expect(fmtValue(0, 'm')).toBe('0 m')
    expect(fmtScore(0.8751)).toBe('0.88')
  })
  it('maps the app target to a v1 target', () => {
    expect(defaultTargetId(d, 'mars-jezero')).toBe('mars_jezero')
    expect(defaultTargetId(d, 'moon-south-pole')).toBe('moon_south_polar_region')
    expect(defaultTargetId(d, 'unknown')).toBe(d.targets[0].id)
  })
})
