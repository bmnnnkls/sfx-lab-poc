import { describe, expect, it } from 'vitest'
import { requireNodeDefinition } from '../registry'

const SAMPLE_RATE = 48000
const context = (frames: number, gate = false) => ({
  frames,
  sampleRate: SAMPLE_RATE,
  note: { frequency: 440, velocity: 1, gate },
})

const run = (type: string, input: Float32Array | null, params: Record<string, number> = {}) => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(SAMPLE_RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const frames = input?.length ?? 1024
  const outputs = definition.outputs.map(() => new Float32Array(frames))
  node.process(context(frames), [input], outputs)
  return outputs[0]!
}

const sine = (frequency: number, frames = 4800) =>
  Float32Array.from({ length: frames }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))

const rms = (buffer: Float32Array) => Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length)

describe('dsp nodes', () => {
  it('oscillator produces the requested frequency', () => {
    const out = run('oscillator', null, { frequency: 480, waveform: 0 })
    let crossings = 0
    for (let i = 1; i < out.length; i++) if (out[i - 1]! < 0 && out[i]! >= 0) crossings++

    // 1024 samples at 480 Hz / 48 kHz = 10.24 cycles.
    expect(crossings).toBeGreaterThanOrEqual(10)
    expect(crossings).toBeLessThanOrEqual(11)
  })

  it('lowpass filter attenuates highs and keeps lows', () => {
    const low = run('filter', sine(200), { cutoff: 1000 })
    const high = run('filter', sine(10000), { cutoff: 1000 })

    expect(rms(low)).toBeGreaterThan(0.6)
    expect(rms(high)).toBeLessThan(0.05)
  })

  it('gain scales its input and honours the cv input', () => {
    const definition = requireNodeDefinition('gain')
    const node = definition.create(SAMPLE_RATE)
    node.setParam('gain', 0.5)
    const out = new Float32Array(4)
    node.process(context(4), [new Float32Array(4).fill(1), new Float32Array(4).fill(0.5)], [out])

    expect(Array.from(out)).toEqual([0.25, 0.25, 0.25, 0.25])
  })

  it('envelope rises to sustain on gate and falls to zero on release', () => {
    const definition = requireNodeDefinition('envelope')
    const node = definition.create(SAMPLE_RATE)
    node.setParam('sustain', 0.5)
    const frames = 24000
    const out = new Float32Array(frames)

    node.process(context(frames, true), [new Float32Array(frames).fill(1)], [out])
    expect(out[frames - 1]).toBeCloseTo(0.5, 3)

    node.process(context(frames), [new Float32Array(frames).fill(0)], [out])
    expect(out[frames - 1]).toBe(0)
  })

  it('delay echoes an impulse after the configured time', () => {
    const impulse = new Float32Array(24000)
    impulse[0] = 1
    const out = run('delay', impulse, { time: 0.25, mix: 1, feedback: 0 })

    expect(out[12000]).toBeCloseTo(1, 3)
    expect(out[0]).toBe(0)
  })
})
