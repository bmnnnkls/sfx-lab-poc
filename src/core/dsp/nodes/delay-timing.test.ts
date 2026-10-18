import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { RIGHT, STEREO_FRAMES } from '../stereo'
import { requireNodeDefinition } from '../registry'
import { DelayTap, delayTiming, DELAY_DIVISIONS, MAX_DELAY_SECONDS } from './delay-timing'

const divisionOf = (label: string) => DELAY_DIVISIONS.findIndex(d => d.label === label)
const run = (type: string, values: Record<string, number>, rate: number, frames: number, options: {
  tempo?: number; changeAt?: number; nextTempo?: number; blocks?: number; signal?: (i: number, channel: number) => number
} = {}) => {
  const node = requireNodeDefinition(type).create(rate)
  for (const [id, value] of Object.entries(values)) node.setParam(id, value)
  const left = new Float32Array(frames), right = new Float32Array(frames)
  const input = new Float32Array(STEREO_FRAMES), output = new Float32Array(STEREO_FRAMES)
  const samples = new SampleBank()
  for (let start = 0; start < frames;) {
    const length = Math.min(options.blocks ?? 128, frames - start, start < (options.changeAt ?? Infinity) ? (options.changeAt ?? Infinity) - start : Infinity)
    input.fill(0); output.fill(0)
    for (let i = 0; i < length; i++) {
      input[i] = options.signal ? options.signal(start + i, 0) : Number(start + i === 0)
      input[RIGHT + i] = options.signal ? options.signal(start + i, 1) : Number(start + i === 0)
    }
    node.process({ frames: length, sampleRate: rate, tempo: start >= (options.changeAt ?? Infinity) ? options.nextTempo : options.tempo, samples, note: { frequency: 0, velocity: 0, gate: false, trigger: 0 } }, [input], [output])
    left.set(output.subarray(0, length), start); right.set(output.subarray(RIGHT, RIGHT + length), start)
    start += length
  }
  return { left, right }
}

describe('bounded musical delay timing', () => {
  it.each([40, 90, 120, 240])('resolves every straight/dotted/triplet division at %s BPM', tempo => {
    DELAY_DIVISIONS.forEach((division, index) => {
      const result = delayTiming({ sync: 1, division: index, time: 0.75 }, { tempo })
      const requested = (division.beats || 0.75) * 60 / tempo
      expect(result.requested).toBeCloseTo(requested, 12)
      expect(result.seconds).toBe(Math.min(8, requested))
      expect(result.capped).toBe(requested > 8)
    })
  })
  it('keeps free seconds and numeric beats, with safe tempo fallback', () => {
    expect(delayTiming({ time: 1.9, sync: 0, division: 24 }, { tempo: 40 }).seconds).toBe(1.9)
    for (const tempo of [undefined, 0, NaN, Infinity]) expect(delayTiming({ time: 0.75, sync: 1 }, { tempo }).seconds).toBe(0.375)
    expect(delayTiming({ sync: 1, division: divisionOf('4 bars dotted') }, { tempo: 40 })).toMatchObject({ seconds: 8, requested: 36, capped: true })
    expect(delayTiming({ sync: 1, division: divisionOf('4 bars') }, { tempo: 120 }).capped).toBe(false)
  })
  for (const type of ['delay', 'pingPong']) {
    it.each([[40, '1/8', 0.75], [90, '1/8 dotted', 0.5], [120, '1/4 triplet', 1 / 3], [240, '2 bars', 2]] as const)(`${type}: impulse at %s BPM / %s agrees within one sample`, (tempo, label, seconds) => {
      const division = divisionOf(label), rate = 48000
      const { left, right } = run(type, { sync: 1, division, mix: 1, feedback: 0.5 }, rate, Math.ceil(seconds * rate * 2 + 10), { tempo })
      const first = left.findIndex(v => Math.abs(v) > 0.05)
      expect(Math.abs(first - seconds * rate)).toBeLessThanOrEqual(1)
      expect(left[first]).toBeGreaterThan(0.3)
      if (type === 'pingPong') {
        expect(right.subarray(0, Math.floor(seconds * rate * 2) - 1).every(v => v === 0)).toBe(true)
        expect(Math.abs(right.findIndex(v => Math.abs(v) > 0.05) - seconds * rate * 2)).toBeLessThanOrEqual(1)
      }
    })
    it(`${type}: retains running echoes across a tempo edit, independent of block size`, () => {
      const options = { tempo: 120, nextTempo: 60, changeAt: 150 }
      const values = { sync: 1, time: 0.2, mix: 1, feedback: 0.5 }
      const a = run(type, values, 1000, 700, options)
      const b = run(type, values, 1000, 700, { ...options, blocks: 17 })
      expect(a).toEqual(b)
      expect(a.left[100]).toBe(1)
      expect(a.left[200]).toBe(1) // original input is still in the line
      expect(type === 'delay' ? a.left[300] : a.right[300]).toBe(0.5) // pre-edit echo remains in feedback
      expect(a.left.every(Number.isFinite) && a.right.every(Number.isFinite)).toBe(true)
    })
    it(`${type}: crossfades a discontinuous tap change over 20 ms`, () => {
      const signal = (i: number) => i < 500 ? 1 : 0
      const result = run(type, { sync: 1, time: 0.2, mix: 1, feedback: 0 }, 1000, 800, { tempo: 120, changeAt: 650, nextTempo: 40, signal })
      expect(result.left[649]).toBe(0)
      expect(result.left[650]).toBe(0)
      expect(result.left[670]).toBe(1)
      let largest = 0
      for (let i = 650; i <= 670; i++) largest = Math.max(largest, Math.abs(result.left[i]! - result.left[i - 1]!))
      expect(largest).toBeLessThanOrEqual(0.051)
    })
    it(`${type}: caps the actual impulse at capacity rather than wrapping it`, () => {
      const { left } = run(type, { sync: 1, division: divisionOf('4 bars dotted'), mix: 1, feedback: 0 }, 1000, 8100, { tempo: 40 })
      expect(left.findIndex(v => v > 0.1)).toBe(MAX_DELAY_SECONDS * 1000)
    })
    it(`${type}: free seconds ignore tempo edits and preserve tails`, () => {
      const values = { time: 0.2, sync: 0, mix: 1, feedback: 0.8 }
      expect(run(type, values, 1000, 900, { tempo: 120, changeAt: 250, nextTempo: 40 })).toEqual(run(type, values, 1000, 900, { tempo: 120 }))
    })
  }
  it('rapid edits finish each fade and then take the latest request without a step', () => {
    const tap = new DelayTap(1000), line = Float32Array.from({ length: 1000 }, (_, i) => i / 1000)
    tap.prepare(100)
    const values: number[] = []
    for (let i = 0; i < 80; i++) {
      tap.prepare(i < 10 ? 200 : i < 15 ? 300 : 400)
      values.push(tap.read(line, 500)); tap.advance()
    }
    expect(values[0]).toBeCloseTo(0.4)
    expect(values.at(-1)).toBeCloseTo(0.1)
    for (let i = 1; i < values.length; i++) expect(Math.abs(values[i]! - values[i - 1]!)).toBeLessThan(0.011)
  })
})
