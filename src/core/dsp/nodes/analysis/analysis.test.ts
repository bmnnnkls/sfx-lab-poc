import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../../sample'
import { createRng } from '../../random'
import { requireNodeDefinition } from '../../registry'
import { Follower, smoothingCoefficient } from './follower'
import { FLOOR_DB, toDecibels } from './level.node'
import { estimatePitch } from './yin'

const RATE = 48000
const BLOCK = 128

const context = (frames: number) => ({
  frames,
  sampleRate: RATE,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

const sine = (frequency: number, length: number, amplitude = 1, rate = RATE) => Float32Array.from({ length }, (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / rate))
const saw = (frequency: number, length: number, _amplitude = 1, rate = RATE) => Float32Array.from({ length }, (_, i) => 2 * (((i * frequency) / rate) % 1) - 1)

/** Runs a node over one input signal in blocks of 128; returns each of its outputs as one long array. */
const run = (type: string, params: Record<string, number>, input: ArrayLike<number> | null, length = input?.length ?? 0): Float32Array[] => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const outputs = definition.outputs.map(() => new Float32Array(length))
  for (let start = 0; start < length; start += BLOCK) {
    const frames = Math.min(BLOCK, length - start)
    const buffer = input ? Float32Array.from({ length: frames }, (_, i) => input[start + i] ?? 0) : null
    node.process(context(frames), [buffer], outputs.map((output) => output.subarray(start, start + frames)))
  }
  return outputs
}

describe('envelope follower', () => {
  it('rises to the level of a steady signal, and falls back to nothing when it stops', () => {
    const loud = new Float32Array(48000).fill(0.8)
    const [up] = run('follower', { mode: 0, attack: 1, release: 50 }, loud)
    expect(up![47999]).toBeCloseTo(0.8, 2)
    const [down] = run('follower', { mode: 0, attack: 1, release: 50 }, new Float32Array([...loud, ...new Float32Array(48000)]))
    expect(down![47999]).toBeCloseTo(0.8, 2)
    expect(down![95999]).toBeLessThan(0.001)
  })

  it('follows a signal that is negative as well: it measures size, not sign', () => {
    const [out] = run('follower', { mode: 0, attack: 1 }, new Float32Array(24000).fill(-0.5))
    expect(out![23999]).toBeCloseTo(0.5, 2)
  })

  it('attack and release set how fast it moves: about 63% of the way in one time constant', () => {
    const rise = run('follower', { mode: 0, attack: 10 }, new Float32Array(2000).fill(1))[0]!
    expect(rise[480]).toBeGreaterThan(0.6)
    expect(rise[480]).toBeLessThan(0.66)
    expect(smoothingCoefficient(10, RATE)).toBeCloseTo(1 - Math.exp(-1 / 480), 10)
  })

  it('RMS of a sine reads 0.707 of its peak, and peak mode reads about its peak', () => {
    const input = sine(220, 48000, 0.8)
    const [rms] = run('follower', { mode: 1, attack: 50, release: 50 }, input)
    const [peak] = run('follower', { mode: 0, attack: 1, release: 200 }, input)
    const tail = (data: Float32Array) => data.subarray(24000).reduce((hi, v) => Math.max(hi, v), 0)
    expect(tail(rms!)).toBeCloseTo(0.8 * Math.SQRT1_2, 1)
    expect(tail(peak!)).toBeGreaterThan(0.7)
    expect(tail(peak!)).toBeLessThanOrEqual(0.8 + 1e-6)
  })

  it('is 0 for silence and for a missing input, and never NaN, whatever comes in', () => {
    expect(run('follower', {}, null, 512)[0]!.every((v) => v === 0)).toBe(true)
    const follower = new Follower()
    expect(follower.next(Number.NaN, 0.5, 0.5, true)).toBe(0)
    expect(follower.next(Infinity, 0.5, 0.5, false)).toBe(0)
    expect(follower.next(1, 0.5, 0.5, true)).toBeGreaterThan(0)
  })
})

describe('level in dB', () => {
  it('reads full scale as 0 dB, and halving as 6 dB less', () => {
    expect(toDecibels(1)).toBeCloseTo(0, 6)
    expect(toDecibels(0.5)).toBeCloseTo(-6.02, 2)
    expect(toDecibels(0.1)).toBeCloseTo(-20, 6)
  })

  it('silence, and anything vanishingly quiet, is the floor', () => {
    expect(toDecibels(0)).toBe(FLOOR_DB)
    expect(toDecibels(1e-9)).toBe(FLOOR_DB)
    expect(toDecibels(Number.NaN)).toBe(FLOOR_DB)
  })

  it('a full-scale sine measures -3 dB RMS and 0 dB peak; a tenth of it 20 dB lower', () => {
    const [rms] = run('level', { mode: 1, time: 50 }, sine(300, 48000))
    const [peak] = run('level', { mode: 0, time: 5 }, new Float32Array(9600).fill(1))
    const [quiet] = run('level', { mode: 1, time: 50 }, sine(300, 48000, 0.1))
    const settled = (data: Float32Array) => data.subarray(36000).reduce((s, v) => s + v, 0) / (data.length - 36000)
    expect(settled(rms!)).toBeCloseTo(-3.01, 0)
    expect(peak![9599]).toBeCloseTo(0, 0)
    expect(settled(rms!) - settled(quiet!)).toBeCloseTo(20, 0)
  })

  it('reads the floor with nothing wired', () => {
    expect(run('level', {}, null, 256)[0]!.every((v) => v === FLOOR_DB)).toBe(true)
  })
})

describe('pitch estimation (YIN)', () => {
  const RATE_LOW = 12000
  const find = (frequency: number, shape: (f: number, n: number, a?: number, r?: number) => Float32Array = sine) => estimatePitch(shape(frequency, 1024, 1, RATE_LOW), RATE_LOW, 60, 1200)

  it.each([55 * 2, 110, 220, 440, 880, 1000])('finds a sine at %i Hz within 1%', (frequency) => {
    const estimate = find(frequency)
    expect(estimate.frequency).toBeGreaterThan(frequency * 0.99)
    expect(estimate.frequency).toBeLessThan(frequency * 1.01)
    expect(estimate.confidence).toBeGreaterThan(0.9)
  })

  it('finds the fundamental of a bright saw, and of a tone with a strong second harmonic', () => {
    expect(find(150, saw).frequency).toBeGreaterThan(148)
    expect(find(150, saw).frequency).toBeLessThan(152)
    const rich = Float32Array.from({ length: 1024 }, (_, i) => Math.sin((2 * Math.PI * 200 * i) / RATE_LOW) + 0.7 * Math.sin((2 * Math.PI * 400 * i) / RATE_LOW))
    expect(estimatePitch(rich, RATE_LOW, 60, 1200).frequency).toBeCloseTo(200, -1)
  })

  it('finds nothing in silence, and little in noise', () => {
    expect(estimatePitch(new Float32Array(1024), RATE_LOW, 60, 1200)).toEqual({ frequency: 0, confidence: 0 })
    const rng = createRng(3)
    const noise = Float32Array.from({ length: 1024 }, () => rng.next() * 2 - 1)
    expect(estimatePitch(noise, RATE_LOW, 60, 1200).confidence).toBeLessThan(0.5)
  })

  it('ignores a pitch outside the range it is told to look in', () => {
    // Above the range the best it can do is a subharmonic that is inside it (2000 Hz fits 1000 Hz, two periods): never a value above the range.
    const high = estimatePitch(sine(2000, 1024, 1, RATE_LOW), RATE_LOW, 60, 1200)
    expect(high.frequency === 0 || (high.frequency >= 60 * 0.9 && high.frequency <= 1200 * 1.1)).toBe(true)
    expect(estimatePitch(sine(30, 1024, 1, RATE_LOW), RATE_LOW, 60, 1200).confidence).toBeLessThan(0.9)
  })

  it('survives silly arguments', () => {
    expect(estimatePitch(new Float32Array(8), 100, 60, 1200).frequency).toBe(0)
    expect(estimatePitch(sine(440, 1024, 1, RATE_LOW), RATE_LOW, 1200, 60).frequency).toBe(0)
  })
})

describe('pitch detector node', () => {
  it('follows a tone: 440 Hz, then 220 Hz, within 1%, and says it is sure', () => {
    const input = Float32Array.from([...sine(440, RATE), ...sine(220, RATE)])
    const [frequency, confidence] = run('pitch', {}, input)
    const at = (data: Float32Array, seconds: number) => data[Math.floor(seconds * RATE)]!
    expect(at(frequency!, 0.9)).toBeGreaterThan(440 * 0.99)
    expect(at(frequency!, 0.9)).toBeLessThan(440 * 1.01)
    expect(at(frequency!, 1.9)).toBeGreaterThan(220 * 0.99)
    expect(at(frequency!, 1.9)).toBeLessThan(220 * 1.01)
    expect(at(confidence!, 1.9)).toBeGreaterThan(0.9)
  })

  it('is 0 until it has heard a pitch, then holds it through silence while the confidence falls', () => {
    const input = Float32Array.from([...new Float32Array(RATE / 2), ...sine(330, RATE / 2), ...new Float32Array(RATE)])
    const [frequency, confidence] = run('pitch', {}, input)
    expect(frequency![RATE / 4]).toBe(0)
    const heard = frequency![Math.floor(1.5 * RATE)]! // well after the tone ended at 1 s and every window is silent
    expect(heard).toBeGreaterThan(330 * 0.99)
    expect(heard).toBeLessThan(330 * 1.01)
    expect(frequency![input.length - 1]).toBe(heard)
    expect(confidence![input.length - 1]).toBe(0)
  })

  it('does not follow noise', () => {
    const rng = createRng(11)
    const noise = Float32Array.from({ length: RATE }, () => (rng.next() * 2 - 1) * 0.5)
    const [frequency] = run('pitch', { threshold: 0.8 }, noise)
    expect(frequency!.every((v) => v === 0)).toBe(true)
  })

  it('gives numbers and no errors for no input', () => {
    const [frequency, confidence] = run('pitch', {}, null, 4096)
    expect(frequency!.every((v) => v === 0) && confidence!.every((v) => v === 0)).toBe(true)
  })
})
