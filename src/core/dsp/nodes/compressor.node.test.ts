import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { MAX_BLOCK_FRAMES } from '../block'
import { requireNodeDefinition } from '../registry'
import { STEREO_FRAMES } from '../stereo'
import { reductionDb } from './compressor.node'

const RATE = 48000
const BLOCK = 128

const context = (frames: number) => ({
  frames,
  sampleRate: RATE,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

const constant = (value: number, length: number) => new Float32Array(length).fill(value)

/** Runs the compressor over an input and an optional sidechain in blocks; returns Out and GR as one long array each. */
const run = (
  params: Record<string, number>,
  input: ArrayLike<number> | null,
  sidechain: ArrayLike<number> | null = null,
  length = input?.length ?? sidechain?.length ?? 0,
): Float32Array[] => {
  const definition = requireNodeDefinition('compressor')
  const node = definition.create(RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const outputs = definition.outputs.map(() => new Float32Array(length))
  for (let start = 0; start < length; start += BLOCK) {
    const frames = Math.min(BLOCK, length - start)
    const buffers = [input, sidechain].map((source) =>
      source === null ? null : Float32Array.from({ length: frames }, (_, i) => source[start + i] ?? 0),
    )
    node.process(context(frames), buffers, outputs.map((output) => output.subarray(start, start + frames)))
  }
  return outputs
}

/** The gain a steady level settles at: the level's dB over the threshold through the gain computer. */
const steadyGain = (level: number, threshold: number, ratio: number, knee: number, makeup = 0): number => {
  const over = 20 * Math.log10(level) - threshold
  const reduction = reductionDb(over, 1 - 1 / ratio, knee)
  return 10 ** ((makeup - reduction) / 20)
}

describe('compressor', () => {
  const END = 47999 // the tail of a one-second run: even a slow attack has fully settled there

  it('passes a quiet sound through untouched', () => {
    const [out, gr] = run({ threshold: -10 }, constant(0.1, 48000))
    expect(out![END]).toBeCloseTo(0.1, 5)
    expect(gr![END]).toBe(0)
  })

  it('turns a loud sound down by the ratio: at 4:1, four dB over comes out one dB over', () => {
    const [out, gr] = run({ threshold: -20, ratio: 4, knee: 0, attack: 1 }, constant(0.5, 48000))
    expect(out![END]).toBeCloseTo(0.5 * steadyGain(0.5, -20, 4, 0), 2)
    expect(gr![END]).toBeCloseTo(-20 * Math.log10(steadyGain(0.5, -20, 4, 0)), 1)
  })

  it('joins the knee to the hard slope with no jump: at the knee edge both agree', () => {
    const threshold = 20 * Math.log10(0.5) - 6 // a 0.5 level lands exactly on the edge of a 12 dB knee
    const hard = run({ threshold, ratio: 4, knee: 0, attack: 1 }, constant(0.5, 48000))[0]!
    const soft = run({ threshold, ratio: 4, knee: 12, attack: 1 }, constant(0.5, 48000))[0]!
    expect(soft[END]).toBeCloseTo(hard[END]!, 4)
  })

  it('a soft knee starts before the threshold: a sound at the threshold is already eased down a little', () => {
    const atThreshold = run({ threshold: -20, ratio: 4, knee: 0, attack: 1 }, constant(0.1, 48000))[0]!
    const soft = run({ threshold: -20, ratio: 4, knee: 12, attack: 1 }, constant(0.1, 48000))
    expect(atThreshold[END]).toBeCloseTo(0.1, 5)
    expect(soft[1]![END]).toBeCloseTo(0.75 * 6 ** 2 / 24, 1) // the gain reduction the knee applies at the threshold
    expect(soft[0]![END]).toBeCloseTo(0.1 * 10 ** (-soft[1]![END]! / 20), 3)
  })

  it('far above the knee the curve has converged to the hard slope', () => {
    const hard = run({ threshold: -30, ratio: 4, knee: 0, attack: 1 }, constant(0.5, 48000))[0]!
    const soft = run({ threshold: -30, ratio: 4, knee: 12, attack: 1 }, constant(0.5, 48000))[0]!
    expect(soft[END]).toBeCloseTo(hard[END]!, 4)
  })

  it('a sidechain decides the ducking even when the input itself is quiet', () => {
    const [out] = run({ threshold: -20, ratio: 4, knee: 0, attack: 1 }, constant(0.1, 48000), constant(0.5, 48000))
    expect(out![END]).toBeCloseTo(0.1 * steadyGain(0.5, -20, 4, 0), 2)
  })

  it('a connected but silent sidechain hears nothing to duck to, so nothing is compressed', () => {
    const [out, gr] = run({ threshold: -20, ratio: 4, knee: 0, attack: 1 }, constant(0.5, 48000), constant(0, 48000))
    expect(out![END]).toBeCloseTo(0.5, 4)
    expect(gr![END]).toBe(0)
  })

  it('the mix blends the compressed sound with the dry one: 0 is dry, 1 fully compressed', () => {
    const dry = run({ threshold: -20, ratio: 4, knee: 0, attack: 1, mix: 0 }, constant(0.5, 48000))[0]!
    const half = run({ threshold: -20, ratio: 4, knee: 0, attack: 1, mix: 0.5 }, constant(0.5, 48000))[0]!
    const wet = run({ threshold: -20, ratio: 4, knee: 0, attack: 1 }, constant(0.5, 48000))[0]!
    expect(dry[END]).toBeCloseTo(0.5, 5)
    expect(half[END]).toBeCloseTo((0.5 + wet[END]!) / 2, 3)
  })

  it('make-up gain lifts the compressed level back up', () => {
    const makeup = -20 * Math.log10(steadyGain(0.5, -20, 4, 0))
    const [out] = run({ threshold: -20, ratio: 4, knee: 0, attack: 1, makeup }, constant(0.5, 48000))
    expect(out![END]).toBeCloseTo(0.5, 2)
  })

  it('comes back up after the loud part stops: the gain returns to one within the release time', () => {
    const input = Float32Array.from([...constant(0.5, 48000), ...constant(0.1, 48000)])
    const [out, gr] = run({ threshold: -20, ratio: 4, knee: 0, attack: 1, release: 50 }, input)
    expect(out![95999]).toBeCloseTo(0.1, 3)
    expect(gr![95999]).toBeCloseTo(0, 1)
  })

  it('compresses both channels with one gain: the detector is their average, so the image never wanders', () => {
    const definition = requireNodeDefinition('compressor')
    const node = definition.create(RATE)
    for (const [id, value] of Object.entries({ threshold: -20, ratio: 4, knee: 0, attack: 1 })) node.setParam(id, value)
    const input = new Float32Array(STEREO_FRAMES)
    input.fill(0.5, 0, MAX_BLOCK_FRAMES)
    input.fill(0.25, MAX_BLOCK_FRAMES)
    const out = new Float32Array(STEREO_FRAMES)
    const gr = new Float32Array(MAX_BLOCK_FRAMES)
    for (let block = 0; block < 200; block++) node.process(context(MAX_BLOCK_FRAMES), [input, null], [out, gr])
    const gain = steadyGain(0.375, -20, 4, 0)
    expect(out[0]).toBeCloseTo(0.5 * gain, 3)
    expect(out[MAX_BLOCK_FRAMES + 100]).toBeCloseTo(0.25 * gain, 3)
    expect(gr[MAX_BLOCK_FRAMES - 1]).toBeCloseTo(-20 * Math.log10(gain), 1)
  })

  it('is silence for missing inputs, and never NaN', () => {
    const [out, gr] = run({}, null, null, 256)
    expect(out!.every((v) => v === 0)).toBe(true)
    expect(gr!.every((v) => v === 0)).toBe(true)
  })
})
