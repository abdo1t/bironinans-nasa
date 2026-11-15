import { describe, expect, it } from 'vitest'
import { faceAngles, latLonToVec } from './support.js'

const rotate = ([x, y, z], yaw, pitch) => {
  // three.js: q = qX(pitch) * qY(yaw) → apply Y first, then X
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw)
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw)
  const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch)
  const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch)
  return [x1, y2, z2]
}

describe('globe geometry', () => {
  it('maps lat/lon onto the equirectangular sphere (lon 0 → +X, 90° E → −Z, north → +Y)', () => {
    const [x0, y0, z0] = latLonToVec(0, 0)
    expect(x0).toBeCloseTo(1, 9)
    expect(y0).toBeCloseTo(0, 9)
    expect(z0).toBeCloseTo(0, 9)
    const [x1, , z1] = latLonToVec(0, 90)
    expect(x1).toBeCloseTo(0, 9)
    expect(z1).toBeCloseTo(-1, 9)
    expect(latLonToVec(90, 0)[1]).toBeCloseTo(1, 9)
  })

  it('turns a mid-latitude site (Jezero) to face the camera (+Z)', () => {
    const { yaw, pitch } = faceAngles(18.44, 77.45)
    const [x, y, z] = rotate(latLonToVec(18.44, 77.45), yaw, pitch)
    expect(Math.abs(x)).toBeLessThan(1e-9)
    expect(Math.abs(y)).toBeLessThan(1e-9)
    expect(z).toBeCloseTo(1, 9)
  })

  it('keeps a polar site (lunar south pole) on the visible hemisphere near the lower limb', () => {
    const { yaw, pitch } = faceAngles(-89.468, -137.4)
    const [, y, z] = rotate(latLonToVec(-89.468, -137.4), yaw, pitch)
    expect(z).toBeGreaterThan(0.4) // facing the viewer
    expect(y).toBeLessThan(-0.5) // below the centre
  })
})
