import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { requireNodeDefinition } from '../registry'

const SAMPLE_RATE = 48000

/** Runs a node in 128-sample blocks the way the engine does, at a tempo and with the note a voice would give it. */
const render = (
  type: string,
  params: Record<string, number>,
  input: Float32Array,
  { tempo, note = 0 }: { tempo?: number; note?: number } = {},
): Float32Array[] => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(SAMPLE_RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const frames = input.length
  const outputs = definition.outputs.map(() => new Float32Array(frames * 2))
  for (let start = 0; start < frames; start += 128) {
    const length = Math.min(128, frames - start)
    const context = {
      frames: length,
      sampleRate: SAMPLE_RATE,
      note: { frequency: note, velocity: 1, gate: note > 0, trigger: 0 },
      samples: new SampleBank(),
      ...(tempo === undefined ? {} : { tempo }),
    }
    node.process(context, [input.subarray(start, start + length)], outputs.map((output) => output.subarray(start, start + length)))
  }
  return outputs
}

const impulse = (frames: number) => {
  const buffer = new Float32Array(frames)
  buffer[0] = 1
  return buffer
}

/** Where the first echo of an impulse lands: the first sample after the dry one that is clearly not silent. */
const firstEcho = (out: Float32Array) => out.findIndex((value, i) => i > 0 && Math.abs(value) > 0.05)

describe('delays in beats', () => {
  it('Sync off keeps Time in seconds, whatever the tempo', () => {
    const [out] = render('delay', { time: 0.25, feedback: 0, mix: 1, sync: 0 }, impulse(SAMPLE_RATE), { tempo: 90 })
    expect(firstEcho(out!)).toBe(0.25 * SAMPLE_RATE)
  })

  it('Sync beat reads Time in beats of the tempo: a dotted eighth at 125 BPM is 0.36 s', () => {
    const [out] = render('delay', { time: 0.75, feedback: 0, mix: 1, sync: 1 }, impulse(SAMPLE_RATE), { tempo: 125 })
    expect(firstEcho(out!)).toBe(Math.round(0.36 * SAMPLE_RATE))
  })

  it('and follows a change of tempo', () => {
    const [slow] = render('delay', { time: 1, feedback: 0, mix: 1, sync: 1 }, impulse(2 * SAMPLE_RATE), { tempo: 60 })
    const [fast] = render('delay', { time: 1, feedback: 0, mix: 1, sync: 1 }, impulse(SAMPLE_RATE), { tempo: 120 })
    expect(firstEcho(slow!)).toBe(SAMPLE_RATE)
    expect(firstEcho(fast!)).toBe(SAMPLE_RATE / 2)
  })

  it('never asks the line for more than it holds (2 s)', () => {
    const [out] = render('delay', { time: 2, feedback: 0, mix: 1, sync: 1 }, impulse(3 * SAMPLE_RATE), { tempo: 30 })
    expect(firstEcho(out!)).toBe(2 * SAMPLE_RATE)
  })

  it('the ping-pong syncs the same way', () => {
    const [out] = render('pingPong', { time: 0.5, feedback: 0, mix: 1, sync: 1 }, impulse(SAMPLE_RATE), { tempo: 120 })
    // Stereo out: left then right, each `frames` long; the first echo is on the left.
    expect(firstEcho(out!.subarray(0, SAMPLE_RATE))).toBe(SAMPLE_RATE / 4)
  })
})

const noise = (frames: number) => {
  let seed = 1
  return Float32Array.from({ length: frames }, () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 30 - 1
  })
}
const rms = (buffer: Float32Array) => Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length)

describe('filter key tracking', () => {
  const brightness = (note: number, keyTrack: number) =>
    rms(render('filter', { mode: 0, cutoff: 500, resonance: 0.707, keyTrack }, noise(SAMPLE_RATE / 2), { note })[0]!.subarray(0, SAMPLE_RATE / 2))

  it('off, the cutoff is the same for every note', () => {
    expect(brightness(1046.5, 0)).toBeCloseTo(brightness(130.8, 0), 5)
  })

  it('on, a higher note opens the filter', () => {
    expect(brightness(1046.5, 1)).toBeGreaterThan(brightness(130.8, 1) * 1.5)
  })

  it('at middle C it leaves the cutoff where the knob is', () => {
    expect(brightness(261.6256, 1)).toBeCloseTo(brightness(261.6256, 0), 5)
  })

  it('without a note (a shared or insert stage) nothing moves', () => {
    expect(brightness(0, 1)).toBeCloseTo(brightness(0, 0), 5)
  })
})

/** The strongest period of a ringing buffer, by autocorrelation, in samples. */
const period = (buffer: Float32Array, from: number, to: number) => {
  let best = 0
  let bestLag = 0
  for (let lag = from; lag <= to; lag++) {
    let sum = 0
    for (let i = 0; i + lag < buffer.length; i++) sum += buffer[i]! * buffer[i + lag]!
    if (sum > best) {
      best = sum
      bestLag = lag
    }
  }
  return bestLag
}

describe('comb', () => {
  const ring = (params: Record<string, number>, note: number) => {
    const burst = new Float32Array(SAMPLE_RATE / 4)
    burst.set(noise(96))
    return render('comb', { feedback: 0.98, damping: 0.1, mix: 1, ...params }, burst, { note })[0]!.subarray(SAMPLE_RATE / 20, SAMPLE_RATE / 4)
  }

  it('rings at the note it is played with', () => {
    expect(period(ring({}, 220), 50, 400)).toBeCloseTo(SAMPLE_RATE / 220, -1)
    expect(period(ring({}, 440), 50, 400)).toBeCloseTo(SAMPLE_RATE / 440, -1)
  })

  it('Pitch shifts it: 12 semitones is an octave up', () => {
    expect(period(ring({ pitch: 12 }, 220), 50, 400)).toBeCloseTo(SAMPLE_RATE / 440, -1)
  })

  it('tuned to fixed, or with no note, it rings at Freq', () => {
    expect(period(ring({ follow: 1, frequency: 300 }, 440), 50, 400)).toBeCloseTo(SAMPLE_RATE / 300, -1)
    expect(period(ring({ frequency: 300 }, 0), 50, 400)).toBeCloseTo(SAMPLE_RATE / 300, -1)
  })

  it('keeps ringing after the burst, and stays finite at the most feedback', () => {
    const out = ring({ feedback: 0.995, damping: 0 }, 110)
    expect(rms(out.subarray(out.length - 1000))).toBeGreaterThan(0.01)
    expect(out.every(Number.isFinite)).toBe(true)
  })
})
