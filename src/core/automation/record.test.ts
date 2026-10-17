import { describe, expect, it } from 'vitest'
import { applyTouch, simplifyTouch, TOUCH_ERROR } from './record'
import { automationPosition } from './evaluate'
import type { AutomationLane, AutomationPoint } from './types'
const p = (beat: number, value: number, interpolation: AutomationPoint['interpolation'] = 'linear'): AutomationPoint => ({ id: `p:${beat}`, beat, value, interpolation })
const lane: AutomationLane = { id: 'lane', enabled: true, target: { kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }, points: [p(0, 0.1), p(2, 0.8), p(4, 0.2)] }
const value = (l: AutomationLane, beat: number) => automationPosition(l, beat)!
describe('Touch replacement', () => {
  it('preserves original ramps and boundary values around just the touched interval', () => {
    const result = applyTouch(lane, [p(1, 0.9), p(1.2, 0.2), p(1.5, 0.7)], 4, 0.5)
    for (const beat of [0, 0.2, 0.9, 1.6, 2, 3, 4]) expect(value(result, beat)).toBeCloseTo(value(lane, beat), 6)
    expect(value(result, 1)).toBe(0.9)
    expect(value(result, 1.2)).toBe(0.2)
    expect(value(result, 1.5)).toBe(0.7)
  })
  it('splits wraps and latest passes replace only their spans', () => {
    const result = applyTouch(lane, [p(3, 0.9), p(4, 0.9), p(5, 0.3), p(7, 0.3), p(8, 0.6), p(8.5, 0.6)], 4, 0.5)
    expect(value(result, 0.25)).toBeCloseTo(0.6)
    expect(value(result, 1)).toBeCloseTo(0.3)
    expect(value(result, 2)).toBeCloseTo(0.3)
    expect(value(result, 3.5)).toBeCloseTo(0.45)
  })
  it('restores the base around a new lane and retains a long held value', () => {
    const result = applyTouch({ ...lane, points: [] }, [p(1, 1), p(3, 1)], 4, 0.4)
    expect(value(result, 0.5)).toBe(0.4)
    expect(value(result, 2)).toBe(1)
    expect(value(result, 3.5)).toBe(0.4)
  })
  it('never ramps discrete transitions, including across wrap', () => {
    const result = applyTouch(lane, [p(3, 0, 'hold'), p(4.5, 1, 'hold'), p(5, 1, 'hold')], 4, 0.5)
    expect(value(result, 0.25)).toBe(0)
    expect(value(result, 0.5)).toBe(1)
    expect(value(result, 3.9)).toBe(0)
  })
  it('refuses overflow atomically instead of truncating untouched points', () => {
    const full = { ...lane, points: Array.from({ length: 2048 }, (_, i) => p(i / 512, i % 2)) }
    expect(() => applyTouch(full, [p(2, 0.5)], 4, 0)).toThrow('2048')
    expect(full.points).toHaveLength(2048)
  })
})
describe('Touch simplification', () => {
  it('bounds normalized error through fast turns and preserves endpoints', () => {
    const input = Array.from({ length: 1000 }, (_, i) => p(i / 100, 0.5 + Math.sin(i / 9) * 0.45))
    const result = simplifyTouch(input)
    expect(result.length).toBeLessThan(input.length)
    expect(result[0]).toBe(input[0]); expect(result.at(-1)).toBe(input.at(-1))
    for (const sample of input) expect(Math.abs(value({ ...lane, points: result }, sample.beat) - sample.value)).toBeLessThanOrEqual(TOUCH_ERROR + 1e-10)
  })
  it('reduces a densely sampled straight line to its endpoints', () => {
    expect(simplifyTouch(Array.from({ length: 1000 }, (_, i) => p(i / 1000, i / 1000)))).toHaveLength(2)
  })
  it('keeps both sides of steps regardless of tolerance', () => {
    const input = [p(0, 0, 'hold'), p(1, 0, 'hold'), p(1.01, 1, 'hold'), p(2, 1, 'hold')]
    expect(simplifyTouch(input, 1)).toEqual(input)
  })
})
