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

const constant = (value: number, frames: number) => new Float32Array(frames).fill(value)
const rms = (buffer: Float32Array, from = 0, to = buffer.length) => {
  let sum = 0
  for (let i = from; i < to; i++) sum += buffer[i]! * buffer[i]!
  return Math.sqrt(sum / (to - from))
}
const crossings = (buffer: Float32Array) => {
  let count = 0
  for (let i = 1; i < buffer.length; i++) if (buffer[i - 1]! < 0 && buffer[i]! >= 0) count++
  return count
}

describe('lfo', () => {
  const ONE_SECOND = SAMPLE_RATE

  it('runs at the requested rate', () => {
    const [out] = render('lfo', { shape: 0, rate: 5 }, [null], ONE_SECOND)
    expect(crossings(out!)).toBeGreaterThanOrEqual(4)
    expect(crossings(out!)).toBeLessThanOrEqual(5)
  })

  it.each([0, 1, 2, 3, 4])('shape %i stays within ±depth, and uni within 0..depth', (shape) => {
    const [out, uni] = render('lfo', { shape, rate: 7, depth: 0.5 }, [null], ONE_SECOND)
    expect(Math.max(...out!)).toBeLessThanOrEqual(0.5 + 1e-6)
    expect(Math.min(...out!)).toBeGreaterThanOrEqual(-0.5 - 1e-6)
    expect(Math.min(...uni!)).toBeGreaterThanOrEqual(-1e-6)
    expect(Math.max(...uni!)).toBeLessThanOrEqual(0.5 + 1e-6)
  })

  it('uni is the bipolar output mapped onto 0..depth', () => {
    const [out, uni] = render('lfo', { shape: 1, rate: 3, depth: 0.8 }, [null], 4096)
    for (let i = 0; i < 4096; i += 97) expect(uni![i]).toBeCloseTo((out![i]! + 0.8) / 2, 5)
  })

  it('depth 0 is silent (centred)', () => {
    const [out, uni] = render('lfo', { depth: 0 }, [null], 1024)
    expect(Math.max(...out!.map(Math.abs))).toBe(0)
    expect(Math.max(...uni!)).toBe(0)
  })

  it('has the shapes it claims: square only takes ±1, saw rises, triangle has no jumps', () => {
    const [square] = render('lfo', { shape: 3, rate: 4 }, [null], ONE_SECOND)
    expect(new Set(square)).toEqual(new Set([1, -1]))

    const [saw] = render('lfo', { shape: 2, rate: 1 }, [null], 4800)
    expect(saw![2400]!).toBeGreaterThan(saw![100]!)

    const [triangle] = render('lfo', { shape: 1, rate: 2 }, [null], ONE_SECOND)
    let largestStep = 0
    for (let i = 1; i < triangle!.length; i++) largestStep = Math.max(largestStep, Math.abs(triangle![i]! - triangle![i - 1]!))
    expect(largestStep).toBeLessThan(0.001)
  })

  it('random holds a value for a whole cycle, then picks another', () => {
    const [out] = render('lfo', { shape: 4, rate: 10 }, [null], ONE_SECOND)
    const values = new Set<number>()
    let changes = 0
    for (let i = 1; i < out!.length; i++) {
      values.add(out![i]!)
      if (out![i] !== out![i - 1]) changes++
    }
    expect(changes).toBeGreaterThanOrEqual(8)
    expect(changes).toBeLessThanOrEqual(11)
    expect(values.size).toBeGreaterThan(5)
  })

  it('is deterministic, so two voices with the same settings agree', () => {
    const first = render('lfo', { shape: 4, rate: 12 }, [null], 8192)[0]!
    const second = render('lfo', { shape: 4, rate: 12 }, [null], 8192)[0]!
    expect(Array.from(first)).toEqual(Array.from(second))
  })

  it('a rising edge on the retrigger input restarts the cycle', () => {
    const frames = 24000
    const gate = new Float32Array(frames)
    gate.fill(1, 12000) // goes high half-way through
    const [free] = render('lfo', { shape: 2, rate: 1 }, [null], frames)
    const [retriggered] = render('lfo', { shape: 2, rate: 1 }, [gate], frames)

    expect(retriggered![11999]).toBeCloseTo(free![11999]!, 6) // unchanged before the gate
    expect(free![12000]!).toBeGreaterThan(-0.6) // free-running saw is mid-cycle
    expect(retriggered![12000]!).toBeCloseTo(-1, 3) // retriggered saw starts over
  })
})

describe('lfo synced to the tempo', () => {
  /** A saw LFO for `frames` samples in blocks of 128, at the given tempo (absent: a context without one). */
  const run = (params: Record<string, number>, frames: number, tempo?: number) => {
    const definition = requireNodeDefinition('lfo')
    const node = definition.create(SAMPLE_RATE)
    for (const [id, value] of Object.entries(params)) node.setParam(id, value)
    const out = new Float32Array(frames)
    for (let start = 0; start < frames; start += 128) {
      const length = Math.min(128, frames - start)
      node.process({ ...context(length), ...(tempo === undefined ? {} : { tempo }) }, [null], [out.subarray(start, start + length), new Float32Array(length)])
    }
    return out
  }
  const wraps = (saw: Float32Array) => saw.reduce((n, v, i) => (i > 0 && v < saw[i - 1]! - 1 ? n + 1 : n), 0)

  it('is in hertz by default, whatever the tempo', () => {
    expect(wraps(run({ shape: 2, rate: 4 }, SAMPLE_RATE, 60))).toBe(wraps(run({ shape: 2, rate: 4 }, SAMPLE_RATE, 200)))
    expect(wraps(run({ shape: 2, rate: 4 }, SAMPLE_RATE, 60))).toBeGreaterThanOrEqual(3)
  })

  it('with Sync on beat the rate is cycles per beat: 1 is once a beat at 120 BPM (2 a second) and once every 2 s at 30 BPM', () => {
    expect(wraps(run({ shape: 2, rate: 1, sync: 1 }, SAMPLE_RATE * 3, 120))).toBeGreaterThanOrEqual(5)
    expect(wraps(run({ shape: 2, rate: 1, sync: 1 }, SAMPLE_RATE * 3, 120))).toBeLessThanOrEqual(6)
    expect(wraps(run({ shape: 2, rate: 1, sync: 1 }, SAMPLE_RATE * 4, 30))).toBeGreaterThanOrEqual(1)
    expect(wraps(run({ shape: 2, rate: 1, sync: 1 }, SAMPLE_RATE * 4, 30))).toBeLessThanOrEqual(2)
  })

  it('with no tempo in the context the beat is 120 BPM', () => {
    expect(Array.from(run({ shape: 2, rate: 2, sync: 1 }, 4096))).toEqual(Array.from(run({ shape: 2, rate: 2, sync: 1 }, 4096, 120)))
  })
})

describe('reverb', () => {
  const impulse = (frames: number) => {
    const buffer = new Float32Array(frames)
    buffer[0] = 1
    return buffer
  }

  it('mix 0 passes the input through exactly', () => {
    const input = sine(300, 4096)
    const [out] = render('reverb', { mix: 0 }, [input], 4096)
    expect(Array.from(out!)).toEqual(Array.from(input))
  })

  it('an impulse leaves a tail that decays', () => {
    const frames = SAMPLE_RATE * 4
    const [out] = render('reverb', { mix: 1, size: 0.5 }, [impulse(frames)], frames)
    const early = rms(out!, 2000, 24000)
    const late = rms(out!, SAMPLE_RATE * 3, SAMPLE_RATE * 4)
    expect(early).toBeGreaterThan(0.001)
    expect(late).toBeLessThan(early / 4)
  })

  it('a bigger size rings longer', () => {
    const frames = SAMPLE_RATE * 3
    const tail = (size: number) => rms(render('reverb', { mix: 1, size }, [impulse(frames)], frames)[0]!, SAMPLE_RATE * 2, frames)
    expect(tail(1)).toBeGreaterThan(tail(0.3) * 3)
  })

  it('more damping darkens the tail', () => {
    const frames = SAMPLE_RATE
    const noiseBurst = Float32Array.from({ length: frames }, (_, i) => (i < 2000 ? Math.sin(i * 2.7) * Math.cos(i * 1.3) : 0))
    const brightness = (damping: number) => {
      const out = render('reverb', { mix: 1, size: 0.8, damping }, [noiseBurst], frames)[0]!
      let highEnergy = 0
      let totalEnergy = 0
      for (let i = 12000; i < frames; i++) {
        const difference = out[i]! - out[i - 1]!
        highEnergy += difference * difference
        totalEnergy += out[i]! * out[i]!
      }
      return highEnergy / totalEnergy
    }
    expect(brightness(1)).toBeLessThan(brightness(0) * 0.8)
  })

  it('stays finite and bounded when fed loud sustained noise at maximum size', () => {
    const frames = SAMPLE_RATE * 5
    let state = 1
    const noise = Float32Array.from({ length: frames }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return (state / 0x100000000) * 2 - 1
    })
    const [out] = render('reverb', { mix: 1, size: 1, damping: 0, predelay: 100 }, [noise], frames)
    let peak = 0
    for (const value of out!) {
      expect(Number.isFinite(value)).toBe(true)
      peak = Math.max(peak, Math.abs(value))
    }
    expect(peak).toBeLessThan(20)
  })

  it('predelay holds the wet signal back', () => {
    const frames = 12000
    const first = (predelay: number) => {
      const out = render('reverb', { mix: 1, size: 0.5, predelay }, [impulse(frames)], frames)[0]!
      return out.findIndex((value) => Math.abs(value) > 1e-6)
    }
    expect(first(50) - first(0)).toBeCloseTo(0.05 * SAMPLE_RATE, -1)
  })

  it('is a shared effect, so all voices feed one reverb', () => {
    expect(requireNodeDefinition('reverb').shared).toBe(true)
    expect(requireNodeDefinition('lfo').shared).toBeUndefined()
  })
})

describe('modulation inputs', () => {
  const FRAMES = 9600

  it('filter cutoff cv opens and closes the filter', () => {
    const input = sine(4000, FRAMES)
    const params = { cutoff: 1000, cvAmount: 2 }
    const closed = render('filter', params, [input, constant(0, FRAMES)], FRAMES)[0]!
    const opened = render('filter', params, [input, constant(1, FRAMES)], FRAMES)[0]! // 1000 Hz × 4 = 4000 Hz
    const shut = render('filter', params, [input, constant(-1, FRAMES)], FRAMES)[0]! // 250 Hz
    expect(rms(opened, 2000)).toBeGreaterThan(rms(closed, 2000) * 4)
    expect(rms(shut, 2000)).toBeLessThan(rms(closed, 2000))
  })

  it('a constant cv of 0 matches the unmodulated filter', () => {
    const input = sine(700, FRAMES)
    const plain = render('filter', { cutoff: 1500 }, [input, null], FRAMES)[0]!
    const zero = render('filter', { cutoff: 1500 }, [input, constant(0, FRAMES)], FRAMES)[0]!
    for (let i = 0; i < FRAMES; i += 53) expect(zero[i]).toBeCloseTo(plain[i]!, 5)
  })

  it('cv amount 0 switches modulation off', () => {
    const input = sine(700, FRAMES)
    const plain = render('filter', { cutoff: 1500 }, [input, null], FRAMES)[0]!
    const off = render('filter', { cutoff: 1500, cvAmount: 0 }, [input, constant(1, FRAMES)], FRAMES)[0]!
    expect(Array.from(off)).toEqual(Array.from(plain))
  })

  it('an LFO on the cutoff makes the output level swell and fade', () => {
    const frames = SAMPLE_RATE
    const lfo = render('lfo', { shape: 0, rate: 2 }, [null], frames)[0]!
    const out = render('filter', { cutoff: 800, cvAmount: 3 }, [sine(3000, frames), lfo], frames)[0]!
    const levels = Array.from({ length: 10 }, (_, k) => rms(out, k * 4800, (k + 1) * 4800))
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels) * 5)
  })

  it('oscillator pitch cv bends the pitch by Pitch CV semitones', () => {
    const frames = SAMPLE_RATE
    const flat = render('oscillator', { frequency: 440, pitchAmount: 12 }, [null, constant(0, frames)], frames)[0]!
    const up = render('oscillator', { frequency: 440, pitchAmount: 12 }, [null, constant(1, frames)], frames)[0]!
    const down = render('oscillator', { frequency: 440, pitchAmount: 12 }, [null, constant(-1, frames)], frames)[0]!
    expect(crossings(flat)).toBeGreaterThanOrEqual(439)
    expect(crossings(flat)).toBeLessThanOrEqual(441)
    expect(Math.abs(crossings(up) - 880)).toBeLessThanOrEqual(2) // an octave up
    expect(Math.abs(crossings(down) - 220)).toBeLessThanOrEqual(2)
  })

  it('an unconnected pitch input leaves the oscillator unchanged', () => {
    const connected = render('oscillator', { frequency: 330 }, [null, constant(0, 4096)], 4096)[0]!
    const unconnected = render('oscillator', { frequency: 330 }, [null, null], 4096)[0]!
    expect(Array.from(connected)).toEqual(Array.from(unconnected))
  })
})
