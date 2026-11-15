import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets.js'
import {
  SHORTLIST_MAX,
  applyStateToSearch,
  decodeWeights,
  defaultState,
  encodeWeights,
  ownQuery,
  parseQuery,
  presetFor,
} from './urlState.js'

const features = ['terrain', 'aridity', 'temp', 'temp_range', 'veg', 'geology', 'ice'].map((id) => ({ id }))
const bundle = {
  features,
  targetById: { 'mars-jezero': {}, 'moon-mare': {} },
  siteById: { atacama: {}, lut: {}, namib: {}, thar: {} },
}

describe('urlState', () => {
  it('round-trips a named preset', () => {
    const s = { ...defaultState(), targetId: 'mars-jezero', presetId: 'rover', weights: { ...PRESETS.rover.weights } }
    const search = applyStateToSearch('', s, features)
    expect(search).toBe('?target=mars-jezero&preset=rover')
    const back = parseQuery(search, bundle)
    expect(back.targetId).toBe('mars-jezero')
    expect(back.presetId).toBe('rover')
    expect(back.weights).toEqual(PRESETS.rover.weights)
  })

  it('round-trips custom weights via w=', () => {
    const weights = { ...PRESETS.balanced.weights, temp: 5 }
    const s = { ...defaultState(), presetId: 'custom', weights }
    const search = applyStateToSearch('', s, features)
    expect(search).toBe('?preset=balanced&w=3-3-5-1-3-3-1')
    const back = parseQuery(search, bundle)
    expect(back.presetId).toBe('custom')
    expect(back.weights).toEqual(weights)
  })

  it('custom weights keep the test type they started from', () => {
    const weights = { ...PRESETS.ice.weights, ice: 0 }
    const s = { ...defaultState(), presetId: 'custom', basePresetId: 'ice', weights }
    const search = applyStateToSearch('', s, features)
    expect(search).toBe(`?preset=ice&w=${encodeWeights(weights, features)}`)
    const back = parseQuery(search, bundle)
    expect([back.presetId, back.basePresetId]).toEqual(['custom', 'ice'])
    // an old link with only w= still parses as custom weights
    expect(parseQuery(`?w=${encodeWeights(weights, features)}`, bundle).presetId).toBe('custom')
  })

  it('recognises custom weights that equal a preset', () => {
    expect(presetFor({ ...PRESETS.ice.weights }, features)).toBe('ice')
    expect(parseQuery(`?w=${encodeWeights(PRESETS.habitat.weights, features)}`, bundle).presetId).toBe('habitat')
  })

  it('rejects malformed weights', () => {
    expect(decodeWeights('3-3-3', features)).toBeNull()
    expect(decodeWeights('3-3-3-1-3-3-9', features)).toBeNull()
    expect(decodeWeights('3-3-x-1-3-3-1', features)).toBeNull()
  })

  it('keeps unknown params (e.g. view) and drops invalid ids', () => {
    const s = { ...defaultState(), targetId: 'moon-mare', shortlist: ['lut', 'namib'] }
    expect(applyStateToSearch('?view=list&preset=ice', s, features)).toBe(
      '?view=list&target=moon-mare&preset=balanced&sites=lut,namib',
    )
    const back = parseQuery('?target=nope&sites=lut,bogus,lut,namib', bundle)
    expect(back.targetId).toBeNull()
    expect(back.shortlist).toEqual(['lut', 'namib'])
  })

  it('ownQuery ignores keys that are not app state (view)', () => {
    expect(ownQuery('?target=a&preset=ice&view=list')).toBe(ownQuery('?view=map&preset=ice&target=a'))
    expect(ownQuery('?target=a&preset=ice')).not.toBe(ownQuery('?target=a&preset=rover'))
  })

  it('caps the shortlist and leaves absent params untouched', () => {
    const back = parseQuery('?sites=atacama,lut,namib,thar', bundle)
    expect(back.shortlist).toHaveLength(SHORTLIST_MAX)
    const prev = { ...defaultState(), targetId: 'mars-jezero', shortlist: ['lut'] }
    expect(parseQuery('', bundle, prev)).toEqual(prev)
  })
})
