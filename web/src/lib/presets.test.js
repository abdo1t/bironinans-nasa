// Guards the data-expansion path: when a criterion is added to features.json, every research
// objective must state its weight explicitly (a missing key silently means weight 0).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRESETS, WEIGHT_MAX, WEIGHT_MIN } from './presets.js'

const features = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/data/features.json', import.meta.url)), 'utf8'))

describe('presets cover the bundle criteria', () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    it(`${id} gives every criterion in features.json an explicit weight in range`, () => {
      for (const f of features) {
        expect(preset.weights, `${id} is missing a weight for "${f.id}"`).toHaveProperty(f.id)
        expect(Number.isInteger(preset.weights[f.id])).toBe(true)
        expect(preset.weights[f.id]).toBeGreaterThanOrEqual(WEIGHT_MIN)
        expect(preset.weights[f.id]).toBeLessThanOrEqual(WEIGHT_MAX)
      }
    })
  }
})
