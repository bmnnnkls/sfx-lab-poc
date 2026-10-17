import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { requireNodeDefinition } from '../registry'

const SAMPLE_RATE = 48000

const context = (frames: number) => ({
  frames,
  sampleRate: SAMPLE_RATE,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

/** Runs the EQ over an input in 128-sample blocks, the way the engine does, and returns its output. */
const run = (params: Record<string, number>, input: ArrayLike<number> | null, length = input?.length ?? 0) => {
  const definition = requireNodeDefinition('eq')
  const node = definition.create(SAMPLE_RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const out = new Float32Array(length)
  for (let start = 0; start < length; start += 128) {
    const frames = Math.min(128, length - start)
    const buffer = input === null ? null : Float32Array.from({ length: frames }, (_, i) => input[start + i] ?? 0)
    node.process(context(frames), [buffer], [out.subarray(start, start + frames)])
  }
  return out
}

const sine = (frequency: number, length: number) =>
  Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))

const rms = (buffer: Float32Array, from = 0, to = buffer.length) => {
  let sum = 0
  for (let i = from; i < to; i++) sum += (buffer[i] ?? 0) ** 2
  return Math.sqrt(sum / (to - from))
}

/** How much quieter the settled tail is than the input there, in dB. */
const gainDb = (input: Float32Array, output: Float32Array) =>
  20 * Math.log10(rms(output, input.length / 2) / rms(input, input.length / 2))

describe('eq', () => {
  const LENGTH = SAMPLE_RATE

  it('boosts a band by the gain amount: +12 dB at 1 kHz', () => {
    const input = sine(1000, LENGTH)
    const out = run({ midGain: 12 }, input)
    expect(gainDb(input, out)).toBeCloseTo(12, 0)
  })

  it('cuts a band: -18 dB at 1 kHz', () => {
    const input = sine(1000, LENGTH)
    const out = run({ midGain: -18 }, input)
    expect(gainDb(input, out)).toBeCloseTo(-18, 0)
  })

  it('the low shelf quiets the lows and leaves the mids alone', () => {
    const low = sine(30, LENGTH) // two octaves under the corner: the shelf has fully bitten
    const mid = sine(1000, LENGTH)
    const cutLow = run({ lowGain: -18 }, low)
    const cutMid = run({ lowGain: -18 }, mid)
    expect(gainDb(low, cutLow)).toBeCloseTo(-18, 0)
    expect(gainDb(mid, cutMid)).toBeGreaterThan(-1)
  })

  it('the high shelf lifts the highs and leaves the mids alone', () => {
    const high = sine(12000, LENGTH)
    const mid = sine(1000, LENGTH)
    const liftHigh = run({ highGain: 12 }, high)
    const liftMid = run({ highGain: 12 }, mid)
    expect(gainDb(high, liftHigh)).toBeCloseTo(12, 0)
    expect(gainDb(mid, liftMid)).toBeLessThan(1)
  })

  it('all bands at 0 are an exact passthrough', () => {
    const input = sine(700, LENGTH)
    const out = run({}, input)
    for (let i = 0; i < LENGTH; i += 37) expect(out[i]).toBeCloseTo(input[i]!, 5)
  })

  it('the mid Q narrows the peak: a high Q leaves a far tone alone', () => {
    const far = sine(200, LENGTH)
    const centre = sine(1000, LENGTH)
    const narrowFar = run({ midGain: 12, midQ: 10 }, far)
    const narrowCentre = run({ midGain: 12, midQ: 10 }, centre)
    expect(gainDb(centre, narrowCentre)).toBeCloseTo(12, 0)
    expect(gainDb(far, narrowFar)).toBeLessThan(1)
  })

  it('is finite at extreme frequencies, near Nyquist and with a ringing Q', () => {
    const input = sine(3000, LENGTH)
    const out = run({ midFreq: 8000, midQ: 10, midGain: 18, highFreq: 20000, highGain: 18 }, input)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('is a shared effect with stereo-capable ports', () => {
    const definition = requireNodeDefinition('eq')
    expect(definition.shared).toBe(true)
    expect(definition.stereoCapable).toBe(true)
  })
})
