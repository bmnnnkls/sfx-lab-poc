import { describe, expect, it } from 'vitest'
import { deleteSampleRegion, fadeIn, fadeOut, keepSampleRegion, normalizeSample, reverseSample } from './edit'

const ramp = (length: number) => Float32Array.from({ length }, (_, i) => i / length)
const mono = (values: number[]) => Float32Array.from(values)

describe('sample edits', () => {
  it('normalize scales the loudest point to just under full scale', () => {
    const next = normalizeSample(mono([0.1, -0.2, 0.4]))
    expect(Math.max(...next)).toBeCloseTo(0.999, 5)
    expect(next[0]!).toBeCloseTo((0.1 / 0.4) * 0.999, 5)
    // The shape is kept: the ratios of the values do not change.
    expect(next[1]! / next[0]!).toBeCloseTo(-2, 3)
  })

  it('normalize leaves silence silent', () => {
    const next = normalizeSample(mono([1e-6, -1e-6]))
    expect(next[0]).toBeCloseTo(1e-6, 6)
    expect(next[1]).toBeCloseTo(-1e-6, 6)
  })

  it('reverse plays the sample backwards', () => {
    expect([...reverseSample(mono([1, 2, 3]))]).toEqual([3, 2, 1])
  })

  it('keep region cuts to the selection, in either drag direction', () => {
    const sample = ramp(100)
    expect(keepSampleRegion(sample, 0.2, 0.4)).toHaveLength(20)
    expect([...keepSampleRegion(sample, 0.4, 0.2)]).toEqual([...keepSampleRegion(sample, 0.2, 0.4)])
    expect(keepSampleRegion(sample, 0.2, 0.4)[0]).toBeCloseTo(0.2, 3)
  })

  it('delete region removes the selection and joins the parts around it', () => {
    const next = deleteSampleRegion(mono([0, 1, 2, 3, 4, 5]), 1 / 6, 4 / 6)
    expect([...next]).toEqual([0, 4, 5])
  })

  it('fade in and out shape the ends only', () => {
    const flat = (length: number) => new Float32Array(length).fill(1)
    // 0.25 s at 100 Hz = 25 frames, so the middle (index 50) is untouched by both fades.
    const inAndOut = fadeOut(fadeIn(flat(100), 100, 0.25), 100, 0.25)
    expect(inAndOut[50]).toBe(1)
    expect(inAndOut[0]).toBeCloseTo(0, 5)
    expect(inAndOut[99]).toBeCloseTo(0, 5)
    expect(inAndOut[25]).toBe(1) // the fade-in is over
    expect(inAndOut[74]).toBe(1) // the fade-out has not begun
    expect(inAndOut[24]).toBeCloseTo(24 / 25, 5)
    expect(inAndOut[87]).toBeCloseTo(12 / 25, 5)
  })
})
