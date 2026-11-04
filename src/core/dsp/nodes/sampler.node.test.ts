import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { midiToFrequency } from '../../shared'
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
    channels: [Float32Array.from({ length: RAMP_LENGTH }, (_, i) => i / RAMP_LENGTH)],
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

describe('sampler node, with the sample\'s loop', () => {
  /** Speed 1 exactly (A4 is 440 Hz, which a float holds), so output frame k reads source frame k: the ramp's values come out as they are. */
  const ROOT = midiToFrequency(69)
  const looped = (loop: { from: number; to: number } | null, params: Record<string, number> = {}) => {
    const bank = bankWithRamp()
    bank.setLoop('ramp', loop)
    return setup({ mode: 2, root: 69, ...params }, bank)
  }
  /** The source frame each output frame read, from the ramp's value. */
  const framesOf = (out: Float32Array) => Array.from(out, (value) => Math.round(value * RAMP_LENGTH))

  it('repeats exactly the loop\'s frames while held, from Start', () => {
    const out = looped({ from: 200, to: 300 }).run(700, () => true, ROOT)
    const expected = Array.from({ length: 700 }, (_, k) => (k < 300 ? k : 200 + ((k - 300) % 100)))
    expect(framesOf(out)).toEqual(expected)
    // Exactly the ramp's values: no interpolation at a whole position.
    expect(out[450]).toBe(Math.fround(250 / RAMP_LENGTH))
  })

  it('interpolates across the wrap, from the loop\'s last frame to its first', () => {
    const out = looped({ from: 200, to: 300 }).run(400, () => true, ROOT * 2 ** (0.5 / 12))
    // Every read is between two frames of the loop, or of the run up to it: never past its end.
    expect(Math.max(...framesOf(out))).toBeLessThanOrEqual(300)
    expect(framesOf(out).slice(320).every((frame) => frame >= 199 && frame <= 300)).toBe(true)
  })

  it('starts past the loop\'s end: plays to the sample\'s end, then wraps to the loop\'s start', () => {
    const out = looped({ from: 200, to: 300 }, { start: 0.5 }).run(700, () => true, ROOT)
    const expected = Array.from({ length: 700 }, (_, k) => (k < 500 ? 500 + k : 200 + ((k - 500) % 100)))
    expect(framesOf(out)).toEqual(expected)
  })

  it('stops looping on release and fades out', () => {
    const out = looped({ from: 200, to: 300 }).run(1400, (i) => i < 450, ROOT)
    // Released at 450 (frame 250 of the loop's second pass): it plays on past the loop's end, fading.
    expect(framesOf(out.map((value, k) => (k < 450 ? value : 0))).slice(0, 450).at(-1)).toBe(249)
    expect(out[460]! / (260 / RAMP_LENGTH)).toBeCloseTo(1 - 10 / (0.01 * SAMPLE_RATE), 3)
    expect(out[460]).toBeGreaterThan(0)
    expect(out[1000]).toBe(0)
  })

  it('is ignored by one-shot and hold', () => {
    for (const mode of [0, 1]) {
      const plain = setup({ mode, root: 69 }).run(1200, (i) => i < 900, ROOT)
      const withLoop = looped({ from: 200, to: 300 }, { mode }).run(1200, (i) => i < 900, ROOT)
      expect(withLoop).toEqual(plain)
    }
  })

  it('keeps a loop that reaches past the audio inside it', () => {
    const out = looped({ from: 900, to: 5000 }).run(1300, () => true, ROOT)
    expect(framesOf(out).slice(1000, 1200)).toEqual(Array.from({ length: 200 }, (_, k) => 900 + (k % 100)))
  })

  it('without a loop, plays bit for bit as before loops existed', () => {
    // Every mode, speeds off the grid, Start, release and retrigger, three kinds of sample; one hash of all the output,
    // taken with the sampler before loops (`6b6c66b`).
    const stereo = new SampleBank()
    stereo.set({ id: 'ramp', sampleRate: 44100, channels: [Float32Array.from({ length: 777 }, (_, i) => Math.sin(i / 9)), Float32Array.from({ length: 777 }, (_, i) => Math.cos(i / 13) * 0.3)] })
    const banks = [bankWithRamp(), bankWithRamp(44100), stereo]
    const hash = createHash('sha256')
    for (const bank of banks) {
      // A loop on another sample changes nothing.
      bank.setLoop('other', { from: 1, to: 5 })
      for (const mode of [0, 1, 2]) for (const start of [0, 0.37]) for (const frequency of [261.6256, 300.1, 523.2511, 130.8128]) {
        const { run } = setup({ mode, start, root: 60, tune: 7 }, bank)
        const out = run(3000, (i) => (i >= 5 && i < 1700) || i >= 2100, frequency)
        hash.update(new Uint8Array(out.buffer))
      }
    }
    expect(hash.digest('hex')).toBe('97f89807f3af6bd11ac2bb48743e0a70f7e076633743e01c8b659449159cc944')
  })
})
