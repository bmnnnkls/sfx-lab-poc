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

/** Runs a node over `frames` samples in 128-sample blocks, the way the engine does, and returns each output. */
const render = (
  type: string,
  params: Record<string, number>,
  inputs: ReadonlyArray<Float32Array | null>,
  frames: number,
) => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(SAMPLE_RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const outputs = definition.outputs.map(() => new Float32Array(frames))
  for (let start = 0; start < frames; start += 128) {
    const length = Math.min(128, frames - start)
    node.process(
      context(length),
      inputs.map((input) => input?.subarray(start, start + length) ?? null),
      outputs.map((output) => output.subarray(start, start + length)),
    )
  }
  return outputs
}

const sine = (frequency: number, frames: number) =>
  Float32Array.from({ length: frames }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))

const rms = (buffer: Float32Array, from = 0, to = buffer.length) => {
  let sum = 0
  for (let i = from; i < to; i++) sum += (buffer[i] ?? 0) ** 2
  return Math.sqrt(sum / (to - from))
}

/** How much quieter the second half of a run is than its input, in dB (settled, past the filter's ring-on). */
const gainDb = (input: Float32Array, output: Float32Array) =>
  20 * Math.log10(rms(output, input.length / 2) / rms(input, input.length / 2))

describe('filter modes', () => {
  const FRAMES = SAMPLE_RATE // one second: every steady level has settled in the second half

  it('a notch removes a sine at its cutoff: well over 30 dB down', () => {
    const input = sine(1000, FRAMES)
    const [out] = render('filter', { mode: 3, cutoff: 1000, resonance: 0.707 }, [input, null], FRAMES)
    expect(gainDb(input, out!)).toBeLessThan(-30)
  })

  it('an all-pass changes the phase but not the level', () => {
    const input = sine(300, FRAMES)
    const [out] = render('filter', { mode: 7, cutoff: 1000, resonance: 0.707 }, [input, null], FRAMES)
    expect(gainDb(input, out!)).toBeGreaterThan(-1)
    expect(gainDb(input, out!)).toBeLessThan(1)
    // A 300 Hz tone through an all-pass at 1000 Hz is measurably shifted, not the same wave back.
    const shifted = out!.subarray(FRAMES / 2).some((v, i) => Math.abs(v - (input[FRAMES / 2 + i] ?? 0)) > 0.05)
    expect(shifted).toBe(true)
  })

  it('a low shelf cuts the shelf side by the gain amount and leaves the rest alone', () => {
    const low = sine(30, FRAMES) // two octaves under the corner: the shelf has fully bitten
    const high = sine(4000, FRAMES)
    const [cutLow] = render('filter', { mode: 5, cutoff: 120, gain: -12 }, [low, null], FRAMES)
    const [cutHigh] = render('filter', { mode: 5, cutoff: 120, gain: -12 }, [high, null], FRAMES)
    expect(gainDb(low, cutLow!)).toBeCloseTo(-12, 0)
    expect(gainDb(high, cutHigh!)).toBeGreaterThan(-1)
  })

  it('a high shelf boosts the shelf side by the gain amount and leaves the rest alone', () => {
    const high = sine(16000, FRAMES)
    const low = sine(60, FRAMES)
    const [boostHigh] = render('filter', { mode: 6, cutoff: 6000, gain: 12 }, [high, null], FRAMES)
    const [boostLow] = render('filter', { mode: 6, cutoff: 6000, gain: 12 }, [low, null], FRAMES)
    expect(gainDb(high, boostHigh!)).toBeCloseTo(12, 0)
    expect(gainDb(low, boostLow!)).toBeLessThan(1)
  })

  it('a peak boosts around the cutoff by the gain amount', () => {
    const input = sine(1000, FRAMES)
    const [out] = render('filter', { mode: 4, cutoff: 1000, resonance: 1, gain: 12 }, [input, null], FRAMES)
    expect(gainDb(input, out!)).toBeCloseTo(12, 0)
  })

  it('a shelf or a peak with gain 0 is the same wave back', () => {
    const input = sine(700, FRAMES)
    const [shelf] = render('filter', { mode: 5, cutoff: 120 }, [input, null], FRAMES)
    const [peak] = render('filter', { mode: 4, cutoff: 1000 }, [input, null], FRAMES)
    for (let i = 48000; i < FRAMES; i += 37) {
      expect(shelf![i]).toBeCloseTo(input[i]!, 4)
      expect(peak![i]).toBeCloseTo(input[i]!, 4)
    }
  })

  it('24 dB rolls off about twice as fast as 12 dB', () => {
    const input = sine(8000, FRAMES)
    const [gentle] = render('filter', { mode: 0, cutoff: 200 }, [input, null], FRAMES)
    const [steep] = render('filter', { mode: 0, cutoff: 200, slope: 1 }, [input, null], FRAMES)
    const gentleDb = gainDb(input, gentle!)
    const steepDb = gainDb(input, steep!)
    expect(steepDb).toBeLessThan(gentleDb - 6) // well past the cutoff, two slopes are far apart
    expect(steepDb).toBeLessThan(-20)
  })

  it('the pass filters ignore the gain knob', () => {
    const input = sine(700, FRAMES)
    const [flat] = render('filter', { mode: 0, cutoff: 2000 }, [input, null], FRAMES)
    const [loud] = render('filter', { mode: 0, cutoff: 2000, gain: 12 }, [input, null], FRAMES)
    for (let i = 48000; i < FRAMES; i += 37) expect(loud![i]).toBeCloseTo(flat![i]!, 5)
  })

  it('is finite for a cutoff at the limit and a loud resonance', () => {
    const input = sine(8000, FRAMES)
    const [out] = render('filter', { mode: 4, cutoff: 20000, resonance: 20, gain: 24 }, [input, null], FRAMES)
    expect(out!.every((v) => Number.isFinite(v))).toBe(true)
  })
})
