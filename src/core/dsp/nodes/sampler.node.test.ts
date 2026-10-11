import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { requireNodeDefinition } from '../registry'
import type { DspNode } from '../types'

const SAMPLE_RATE = 48000
const RAMP_LENGTH = 1000

/** A ramp 0, 0.001, 0.002, … so the output reveals exactly which source positions were read. */
const bankWithRamp = (sampleRate = SAMPLE_RATE) => {
  const bank = new SampleBank()
  bank.set({
    id: 'ramp',
    sampleRate,
    data: Float32Array.from({ length: RAMP_LENGTH }, (_, i) => i / RAMP_LENGTH),
  })
  return bank
}

const setup = (params: Record<string, number> = {}, bank = bankWithRamp()) => {
  const node: DspNode = requireNodeDefinition('sampler').create(SAMPLE_RATE)
  node.setSample?.('ramp')
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)

  /** Renders `frames` with constant frequency and a gate pattern: (index) => boolean. */
  const run = (frames: number, gate: (index: number) => boolean, frequency = 261.6256) => {
    const out = new Float32Array(frames)
    node.process(
      { frames, sampleRate: SAMPLE_RATE, note: { frequency, velocity: 1, gate: true, trigger: 0 }, samples: bank },
      [new Float32Array(frames).fill(frequency), Float32Array.from({ length: frames }, (_, i) => (gate(i) ? 1 : 0))],
      [out],
    )
    return out
  }
  return { node, run }
}

describe('sampler node', () => {
  it('plays the sample at original speed on its root note, then stops (one-shot)', () => {
    const { run } = setup({ root: 60 })
    const out = run(1200, (i) => i >= 10)

    expect(out[9]).toBe(0)
    expect(out[10]).toBeCloseTo(0, 6)
    expect(out[10 + 500]).toBeCloseTo(0.5, 2)
    expect(out[10 + 999]).toBeCloseTo(0.999, 2)
    expect(out[10 + 1100]).toBe(0)
  })

  it('plays twice as fast an octave up and half as fast an octave down', () => {
    const up = setup({ root: 60 }).run(600, () => true, 523.2511)
    expect(up[250]).toBeCloseTo(0.5, 2) // 250 samples * 2 = 500 source samples

    const down = setup({ root: 60 }).run(600, () => true, 130.8128)
    expect(down[500]).toBeCloseTo(0.25, 2) // 500 * 0.5 = 250
  })

  it('compensates for a sample recorded at a different rate', () => {
    // 24 kHz material in a 48 kHz context should run at half speed at the root note.
    const { run } = setup({ root: 60 }, bankWithRamp(24000))
    expect(run(600, () => true)[500]).toBeCloseTo(0.25, 2)
  })

  it('one-shot ignores the gate falling; hold stops shortly after it', () => {
    const oneShot = setup({ mode: 0 }).run(800, (i) => i < 100)
    expect(oneShot[700]).toBeGreaterThan(0.5)

    const hold = setup({ mode: 1 }).run(2000, (i) => i < 100)
    expect(hold[99]).toBeGreaterThan(0)
    expect(hold[1500]).toBe(0) // faded out within ~10 ms (480 frames)
  })

  it('loop repeats the sample while the gate is held', () => {
    const { run } = setup({ mode: 2 })
    const out = run(2500, () => true)

    expect(out[2200]).toBeGreaterThan(0.1) // still sounding after the sample length (1000)
    expect(out[1500]).toBeCloseTo(0.5, 1) // second pass through the ramp
  })

  it('starts from the Start offset', () => {
    const out = setup({ start: 0.5 }).run(10, () => true)
    expect(out[0]).toBeCloseTo(0.5, 2)
  })

  it('retriggers from the start on each new gate', () => {
    const { run } = setup()
    const out = run(1500, (i) => i < 10 || i >= 600)

    expect(out[600]).toBeCloseTo(0, 2)
    expect(out[699]).toBeGreaterThan(0.05)
  })

  it('is silent with no sample, an unknown sample, or no gate connected', () => {
    const none = requireNodeDefinition('sampler').create(SAMPLE_RATE)
    const out = new Float32Array(64).fill(1)
    const context = {
      frames: 64,
      sampleRate: SAMPLE_RATE,
      note: { frequency: 440, velocity: 1, gate: true, trigger: 0 },
      samples: bankWithRamp(),
    }
    none.process(context, [null, new Float32Array(64).fill(1)], [out])
    expect(out.every((v) => v === 0)).toBe(true)

    none.setSample?.('does-not-exist')
    none.process(context, [null, new Float32Array(64).fill(1)], [out])
    expect(out.every((v) => v === 0)).toBe(true)

    none.setSample?.('ramp')
    none.process(context, [null, null], [out])
    expect(out.every((v) => v === 0)).toBe(true)
  })
})
