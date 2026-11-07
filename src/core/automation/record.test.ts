import { describe, expect, it } from 'vitest'
import { MAX_TIMELINE_BEATS } from '../project'
import { applyTimelineTouch, applyTouch, simplifyTouch, TOUCH_ERROR } from './record'
import { automationPosition } from './evaluate'
import type { AutomationLane, AutomationPoint } from './types'
const p = (beat: number, value: number, interpolation: AutomationPoint['interpolation'] = 'linear'): AutomationPoint => ({ id: `p:${beat}`, beat, value, interpolation })
const lane: AutomationLane = { id: 'lane', enabled: true, target: { kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }, points: [p(0, 0.1), p(2, 0.8), p(4, 0.2)] }
const value = (l: AutomationLane, beat: number) => automationPosition(l, beat)!
const clip = { offset: 0, length: 4, extent: 4 }
const shape = (l: AutomationLane) => l.points.map((x) => [x.beat, x.value, x.interpolation])
describe('Touch replacement', () => {
  it('preserves original ramps and boundary values around just the touched interval', () => {
    const result = applyTouch(lane, [p(1, 0.9), p(1.2, 0.2), p(1.5, 0.7)], clip, 0.5)
    for (const beat of [0, 0.2, 0.9, 1.6, 2, 3, 4]) expect(value(result, beat)).toBeCloseTo(value(lane, beat), 6)
    expect(value(result, 1)).toBe(0.9)
    expect(value(result, 1.2)).toBe(0.2)
    expect(value(result, 1.5)).toBe(0.7)
  })
  it('splits wraps and latest passes replace only their spans', () => {
    const result = applyTouch(lane, [p(3, 0.9), p(4, 0.9), p(5, 0.3), p(7, 0.3), p(8, 0.6), p(8.5, 0.6)], clip, 0.5)
    expect(value(result, 0.25)).toBeCloseTo(0.6)
    expect(value(result, 1)).toBeCloseTo(0.3)
    expect(value(result, 2)).toBeCloseTo(0.3)
    expect(value(result, 3.5)).toBeCloseTo(0.45)
  })
  it('restores the base around a new lane and retains a long held value', () => {
    const result = applyTouch({ ...lane, points: [] }, [p(1, 1), p(3, 1)], clip, 0.4)
    expect(value(result, 0.5)).toBe(0.4)
    expect(value(result, 2)).toBe(1)
    expect(value(result, 3.5)).toBe(0.4)
  })
  it('never ramps discrete transitions, including across wrap', () => {
    const result = applyTouch(lane, [p(3, 0, 'hold'), p(4.5, 1, 'hold'), p(5, 1, 'hold')], clip, 0.5)
    expect(value(result, 0.25)).toBe(0)
    expect(value(result, 0.5)).toBe(1)
    expect(value(result, 3.9)).toBe(0)
  })
  it('refuses overflow atomically instead of truncating untouched points', () => {
    const full = { ...lane, points: Array.from({ length: 2048 }, (_, i) => p(i / 512, i % 2)) }
    expect(() => applyTouch(full, [p(2, 0.5)], clip, 0)).toThrow('2048')
    expect(full.points).toHaveLength(2048)
  })
})
describe('Touch with a span', () => {
  it('records a looped clip exactly as before the span', () => {
    const samples = [p(2.5, 0.9), p(3.2, 0.1), p(4.4, 0.6), p(5, 0.3, 'hold'), p(6.1, 0.7), p(7.9, 0.2), p(9.5, 0.5), p(10.25, 0.95)]
    // Taken from the function before it had a span.
    expect(shape(applyTouch(lane, samples, clip, 0.5))).toEqual([[0, 0.21874999999999994, 'linear'], [1.5, 0.5, 'linear'], [2.25, 0.95, 'hold'], [2.2500001, 0.6583333055555555, 'linear'], [3.9000000000000004, 0.2, 'linear'], [4, 0.21874999999999994, 'hold']])
  })
  it('splits passes from an offset, keeps what lies before it, and the last pass wins', () => {
    const timeline = { ...lane, points: [p(0, 0.1), p(20, 0.1)] }
    // A brace 8 to 12: take time 9 to 17 is pass 0 from 9, pass 1 whole, pass 2 to 1 beat in.
    const result = applyTouch(timeline, [p(9, 0.9), p(12, 0.9), p(12.01, 0.3), p(15.99, 0.3), p(16, 0.6), p(17, 0.6)], { offset: 8, length: 4, extent: MAX_TIMELINE_BEATS }, 0.5)
    expect(value(result, 4)).toBeCloseTo(0.1)
    expect(value(result, 8.5)).toBeCloseTo(0.6)
    expect(value(result, 10)).toBeCloseTo(0.3)
    expect(value(result, 11.5)).toBeCloseTo(0.3)
    expect(value(result, 14)).toBeCloseTo(0.1)
    expect(value(result, 20)).toBeCloseTo(0.1)
  })
  it('writes the part before the brace straight and the rest by passes, into one lane', () => {
    const result = applyTimelineTouch({ ...lane, points: [] }, [p(6, 0.2), p(8, 0.2), p(8.01, 0.7), p(12, 0.7), p(12.01, 0.9), p(13, 0.9)], { from: 8, to: 12 }, 0.5)
    expect(value(result, 5)).toBe(0.5)
    expect(value(result, 7)).toBeCloseTo(0.2)
    expect(value(result, 8.5)).toBeCloseTo(0.9)
    expect(value(result, 10)).toBeCloseTo(0.7)
    expect(value(result, 12.5)).toBe(0.5)
  })
  it('without a brace, takes song beats with no wrap and is canonical to the timeline', () => {
    const result = applyTimelineTouch({ ...lane, points: [] }, [p(4090, 0.3), p(4100, 0.3)], undefined, 0.5)
    expect(result.points.every((x) => x.beat <= MAX_TIMELINE_BEATS)).toBe(true)
    expect(value(result, 4000)).toBe(0.5)
    expect(value(result, MAX_TIMELINE_BEATS)).toBeCloseTo(0.3)
    expect(value(applyTimelineTouch({ ...lane, points: [] }, [p(1, 0.3), p(9, 0.8)], undefined, 0.5), 9)).toBeCloseTo(0.8)
  })
  it('refuses a take past 2048 points whole, on the timeline too', () => {
    const full = { ...lane, points: Array.from({ length: 2048 }, (_, i) => p(i, i % 2)) }
    expect(() => applyTimelineTouch(full, [p(9.2, 0.5), p(9.4, 0.9), p(9.6, 0.2)], { from: 8, to: 12 }, 0)).toThrow('2048')
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
