import { describe, expect, it } from 'vitest'
import { BUNDLE_FILES, CONTRACT, checkBundle } from './bundleIntegrity.js'

const hashes = Object.fromEntries(BUNDLE_FILES.map((f) => [f, `h-${f}`]))
const manifest = (kind) => ({ contract: CONTRACT, kind, files: { ...hashes } })
const realParsed = () => ({
  targets: [{ id: 't', refs: { temp: 'Literature: Example et al. 2020' } }],
  sites: { features: [{ properties: { id: 's', sources: { aridity: 'NASA POWER PRECTOTCORR' } } }] },
  scores: { generatedAt: '2026-11-13T00:00:00Z' },
})

describe('bundle integrity', () => {
  it('accepts a consistent real bundle', () => {
    expect(checkBundle({ manifest: manifest('real'), hashes, parsed: realParsed(), expectedKind: 'real' })).toEqual([])
  })

  it('rejects a mock manifest in a real build (and vice versa)', () => {
    expect(checkBundle({ manifest: manifest('mock'), hashes, parsed: realParsed(), expectedKind: 'real' })).toContain(
      'bundle kind is "mock" but this build expects "real"',
    )
    const mockParsed = { ...realParsed(), scores: { generatedAt: 'MOCK' } }
    expect(checkBundle({ manifest: manifest('real'), hashes, parsed: mockParsed, expectedKind: 'mock' }).length).toBeGreaterThan(0)
  })

  it('rejects a file swapped after the manifest was written', () => {
    const bad = { ...hashes, 'sites.geojson': 'different' }
    expect(checkBundle({ manifest: manifest('real'), hashes: bad, parsed: realParsed(), expectedKind: 'real' })).toContain(
      'sites.geojson does not match manifest.json (hash mismatch)',
    )
  })

  it('rejects any MOCK value inside a real bundle', () => {
    const p = realParsed()
    p.sites.features[0].properties.sources.temp = 'MOCK — synthetic placeholder, not a measurement'
    p.targets[0].refs.ice = 'MOCK — synthetic placeholder, not a measurement'
    p.scores.generatedAt = 'MOCK'
    const problems = checkBundle({ manifest: manifest('real'), hashes, parsed: p, expectedKind: 'real' })
    expect(problems).toEqual(
      expect.arrayContaining([
        'scores.json is marked MOCK in a real build',
        'site s: temp has a MOCK source',
        'target t: ice has a MOCK reference',
      ]),
    )
  })
})
