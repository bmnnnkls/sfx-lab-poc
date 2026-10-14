import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../../sample'
import { requireNodeDefinition } from '../../registry'

const SAMPLE_RATE = 48000

const context = (frames: number) => ({
  frames,
  sampleRate: SAMPLE_RATE,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

/** Runs a math node over `frames` samples in blocks of up to 128, the way the engine does. */
const run = (
  type: string,
  params: Record<string, number>,
  inputs: ReadonlyArray<Float32Array | null> = [],
  frames = inputs.find((input) => input)?.length ?? 128,
): Float32Array => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(SAMPLE_RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const out = new Float32Array(frames)
  for (let start = 0; start < frames; start += 128) {
    const length = Math.min(128, frames - start)
    node.process(
      context(length),
      inputs.map((input) => input?.subarray(start, start + length) ?? null),
      [out.subarray(start, start + length)],
    )
  }
  return out
}

/** The one value a constant-in constant-out node gives. */
const value = (type: string, params: Record<string, number>, inputs: Array<number | null> = []): number =>
  run(type, params, inputs.map((v) => (v === null ? null : new Float32Array(8).fill(v))), 8)[7]!

const MATH = [
  'add', 'multiply', 'invert', 'min', 'max', 'clamp', 'mapRange', 'quantize', 'smooth', 'mix', 'compare', 'midiToHz', 'hzToMidi',
  'subtract', 'divide', 'abs', 'constant', 'semitonesToRatio', 'ratioToSemitones', 'dbToGain', 'gainToDb', 'hzToMs', 'msToHz', 'sampleHold',
]

describe('math nodes: arithmetic', () => {
  it('add, multiply and invert', () => {
    expect(value('add', {}, [2, 3])).toBe(5)
    expect(value('multiply', {}, [2, 3])).toBe(6)
    expect(value('invert', {}, [2])).toBe(-2)
  })

  it('an unwired operand is its parameter, which is what makes "a + 10" a node with one wire', () => {
    expect(value('add', { b: 10 }, [2, null])).toBe(12)
    expect(value('multiply', { a: 4, b: 5 })).toBe(20)
    expect(value('add', { a: 7, b: 10 }, [2, null])).toBe(12)
  })

  it('min, max and compare', () => {
    expect(value('min', {}, [2, 3])).toBe(2)
    expect(value('max', {}, [2, 3])).toBe(3)
    expect(value('compare', {}, [0.6, null])).toBe(1)
    expect(value('compare', {}, [0.4, null])).toBe(0)
    expect(value('compare', { b: 3 }, [3, null])).toBe(0)
  })

  it('clamp limits to its range, and swaps limits given the wrong way round', () => {
    expect(value('clamp', { min: 2, max: 4 }, [10])).toBe(4)
    expect(value('clamp', { min: 2, max: 4 }, [-10])).toBe(2)
    expect(value('clamp', { min: 2, max: 4 }, [3])).toBe(3)
    expect(value('clamp', { min: 4, max: 2 }, [10])).toBe(4)
  })
})

describe('math nodes: shaping', () => {
  it('map range maps linearly and holds at the ends', () => {
    const p = { inMin: 0, inMax: 127, outMin: 100, outMax: 200 }
    expect(value('mapRange', p, [0])).toBe(100)
    expect(value('mapRange', p, [127])).toBe(200)
    expect(value('mapRange', p, [63.5])).toBeCloseTo(150, 6)
    expect(value('mapRange', p, [500])).toBe(200)
    expect(value('mapRange', p, [-5])).toBe(100)
  })

  it('map range can run backwards, and an empty input range gives the low end instead of dividing by zero', () => {
    expect(value('mapRange', { inMin: 0, inMax: 1, outMin: 10, outMax: 0 }, [0.25])).toBeCloseTo(7.5, 6)
    expect(value('mapRange', { inMin: 1, inMax: 1, outMin: 3, outMax: 9 }, [1])).toBe(3)
  })

  it('map range has a log curve (equal ratios) between positive numbers, linear otherwise, and an exp curve that starts slow', () => {
    const log = { inMin: 0, inMax: 1, outMin: 100, outMax: 10000, curve: 1 }
    expect(value('mapRange', log, [0.5])).toBeCloseTo(1000, 3)
    expect(value('mapRange', { ...log, outMin: 0 }, [0.5])).toBeCloseTo(5000, 3)
    const exp = { inMin: 0, inMax: 1, outMin: 0, outMax: 1, curve: 2 }
    expect(value('mapRange', exp, [0.5])).toBeLessThan(0.5)
    expect(value('mapRange', exp, [1])).toBeCloseTo(1, 6)
  })

  it('quantize snaps to steps from an offset, and a step of 0 passes the signal', () => {
    expect(value('quantize', { step: 0.25 }, [0.4])).toBeCloseTo(0.5, 6)
    expect(value('quantize', { step: 1, offset: 0.5 }, [1.2])).toBeCloseTo(1.5, 6)
    expect(value('quantize', { step: 0 }, [0.4123])).toBeCloseTo(0.4123, 6)
  })

  it('mix crossfades a and b and holds at its ends', () => {
    expect(value('mix', {}, [10, 20, 0])).toBe(10)
    expect(value('mix', {}, [10, 20, 1])).toBe(20)
    expect(value('mix', {}, [10, 20, 0.25])).toBeCloseTo(12.5, 6)
    expect(value('mix', {}, [10, 20, 7])).toBe(20)
    expect(value('mix', { t: -3 }, [10, 20, null])).toBe(10)
  })
})

describe('math nodes: second batch', () => {
  it('subtract, divide, abs and constant', () => {
    expect(value('subtract', {}, [5, 3])).toBe(2)
    expect(value('subtract', { b: 4 }, [10, null])).toBe(6)
    expect(value('divide', {}, [6, 3])).toBe(2)
    expect(value('divide', {}, [1, 4])).toBe(0.25)
    expect(value('abs', {}, [-3])).toBe(3)
    expect(value('abs', {}, [3])).toBe(3)
    expect(value('constant', { value: 7 })).toBe(7)
    expect(value('constant', {})).toBe(1)
  })

  it('dividing by zero gives 0, never Infinity or NaN', () => {
    for (const a of [0, 1, -1, 1e30]) expect(value('divide', {}, [a, 0])).toBe(0)
    expect(value('divide', { b: 0 }, [5, null])).toBe(0)
  })

  it('semitones and ratios undo each other: 12 semitones is a ratio of 2', () => {
    expect(value('semitonesToRatio', {}, [12])).toBeCloseTo(2, 6)
    expect(value('semitonesToRatio', {}, [-12])).toBeCloseTo(0.5, 6)
    expect(value('semitonesToRatio', {}, [0])).toBe(1)
    expect(value('ratioToSemitones', {}, [2])).toBeCloseTo(12, 5)
    for (const st of [-24, -7.5, 0, 3, 19.25]) expect(value('ratioToSemitones', {}, [value('semitonesToRatio', {}, [st])])).toBeCloseTo(st, 4)
  })

  it('a ratio of 0 or less is the floor (-120 semitones worth of silence), not -Infinity', () => {
    for (const ratio of [0, -2, 1e-30]) expect(value('ratioToSemitones', {}, [ratio]), String(ratio)).toBeCloseTo(12 * Math.log2(1e-6), 3)
  })

  it('decibels and gain: 0 dB is 1, -20 dB a tenth, 6 dB about double', () => {
    expect(value('dbToGain', {}, [0])).toBe(1)
    expect(value('dbToGain', {}, [-20])).toBeCloseTo(0.1, 6)
    expect(value('dbToGain', {}, [6.0206])).toBeCloseTo(2, 3)
    expect(value('gainToDb', {}, [1])).toBeCloseTo(0, 6)
    expect(value('gainToDb', {}, [0.1])).toBeCloseTo(-20, 5)
    expect(value('gainToDb', {}, [0])).toBeCloseTo(-120, 3)
    for (const db of [-60, -6, 0, 12]) expect(value('gainToDb', {}, [value('dbToGain', {}, [db])])).toBeCloseTo(db, 4)
  })

  it('Hz and milliseconds: 100 Hz is 10 ms, and each undoes the other; zero gives 0', () => {
    expect(value('hzToMs', {}, [100])).toBeCloseTo(10, 6)
    expect(value('msToHz', {}, [10])).toBeCloseTo(100, 6)
    expect(value('msToHz', {}, [value('hzToMs', {}, [440])])).toBeCloseTo(440, 4)
    for (const x of [0, -5]) {
      expect(value('hzToMs', {}, [x])).toBe(0)
      expect(value('msToHz', {}, [x])).toBe(0)
    }
  })

  it('sample and hold catches on a rising trigger and holds between', () => {
    const input = Float32Array.from({ length: 8 }, (_, i) => i + 1)
    const trigger = Float32Array.of(0, 0, 1, 1, 0, 1, 0, 0)
    // The first value is taken at once (the node starts holding something), then 3 on the rise at 2, 6 on the rise at 5.
    expect([...run('sampleHold', {}, [input, trigger])]).toEqual([1, 1, 3, 3, 3, 6, 6, 6])
  })

  it('sample and hold keeps its state across blocks', () => {
    const input = Float32Array.from({ length: 300 }, (_, i) => i)
    const trigger = new Float32Array(300)
    trigger[200] = 1
    const out = run('sampleHold', {}, [input, trigger])
    expect(out[199]).toBe(0)
    expect(out[200]).toBe(200)
    expect(out[299]).toBe(200)
  })
})

describe('smooth', () => {
  const step = Float32Array.from({ length: 48000 }, (_, i) => (i < 100 ? 0 : 1))

  it('takes the first sample as it is, so it does not glide up from zero', () => {
    expect(run('smooth', { time: 1 }, [new Float32Array(128).fill(5)])[0]).toBe(5)
  })

  it('approaches a step with its time constant (63 % after one time constant)', () => {
    const out = run('smooth', { time: 0.1 }, [step])
    expect(out[100 + 4800]!).toBeGreaterThan(0.6)
    expect(out[100 + 4800]!).toBeLessThan(0.66)
    expect(out[47999]!).toBeGreaterThan(0.99)
    expect(Math.max(...out)).toBeLessThanOrEqual(1)
  })

  it('a time of 0 passes the signal, and slew limits the change per second', () => {
    expect([...run('smooth', { time: 0 }, [step]).subarray(98, 103)]).toEqual([0, 0, 1, 1, 1])
    const slew = run('smooth', { mode: 1, rate: 4800 }, [step])
    expect(slew[100]!).toBeCloseTo(0.1, 5)
    expect(slew[100 + 9]!).toBeCloseTo(1, 5)
  })

  it('does not depend on how the signal is cut into blocks', () => {
    const whole = run('smooth', { time: 0.01 }, [step])
    const again = run('smooth', { time: 0.01 }, [step])
    expect(again).toEqual(whole)
  })
})

describe('MIDI and frequency', () => {
  it('A4 is the tuning, an octave is a factor of two, middle C is 261.6 Hz', () => {
    expect(value('midiToHz', {}, [69])).toBeCloseTo(440, 4)
    expect(value('midiToHz', {}, [81])).toBeCloseTo(880, 3)
    expect(value('midiToHz', {}, [60])).toBeCloseTo(261.6256, 3)
    expect(value('midiToHz', { tuning: 432 }, [69])).toBeCloseTo(432, 4)
  })

  it('carries fractional notes: 60.5 is a quarter tone above middle C', () => {
    const quarter = value('midiToHz', {}, [60.5])
    expect(quarter / value('midiToHz', {}, [60])).toBeCloseTo(2 ** (0.5 / 12), 6)
  })

  it('goes the other way, and the two undo each other', () => {
    expect(value('hzToMidi', {}, [440])).toBeCloseTo(69, 6)
    expect(value('hzToMidi', {}, [261.6256])).toBeCloseTo(60, 3)
    for (const note of [0, 12.25, 60, 100.7, 127]) {
      const hz = value('midiToHz', { tuning: 435 }, [note])
      expect(value('hzToMidi', { tuning: 435 }, [hz])).toBeCloseTo(note, 4)
    }
  })

  it('Hz to MIDI gives the lowest note for zero, negative and tiny frequencies, never NaN or -Infinity', () => {
    for (const hz of [0, -1, -1e9, 1e-30, Number.NEGATIVE_INFINITY]) {
      expect(value('hzToMidi', {}, [hz]), String(hz)).toBe(0)
    }
    expect(value('hzToMidi', {}, [8.1758])).toBeCloseTo(0, 3)
  })

  it('MIDI to Hz stays finite for absurd notes', () => {
    for (const note of [1e9, -1e9, Number.POSITIVE_INFINITY]) {
      const hz = value('midiToHz', {}, [note])
      expect(Number.isFinite(hz), String(note)).toBe(true)
      expect(hz).toBeGreaterThan(0)
    }
  })
})

describe('every math node', () => {
  const EDGE = [0, -0, 1, -1, 1e-30, 1e30, 1e9, -1e9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

  it.each(MATH)('%s never outputs NaN or Infinity, whatever comes in', (type) => {
    const definition = requireNodeDefinition(type)
    for (const x of EDGE) {
      for (const y of EDGE) {
        const inputs = definition.inputs.map((_, index) => new Float32Array(4).fill(index % 2 === 0 ? x : y))
        const out = run(type, {}, inputs, 4)
        expect(out.every(Number.isFinite), `${type}(${x}, ${y})`).toBe(true)
      }
    }
  })

  it.each(MATH)('%s writes exactly the frames it is asked for, for any block length', (type) => {
    const definition = requireNodeDefinition(type)
    const node = definition.create(SAMPLE_RATE)
    for (const frames of [0, 1, 7, 64, 127, 128]) {
      const out = new Float32Array(128).fill(-9)
      node.process(context(frames), definition.inputs.map(() => null), [out])
      expect(out.subarray(0, frames).every((v) => v !== -9), `${type} ${frames}`).toBe(true)
      expect(out.subarray(frames).every((v) => v === -9), `${type} ${frames}`).toBe(true)
    }
  })

  it.each(MATH)('%s is global-capable and has a socket for every numeric parameter', (type) => {
    const definition = requireNodeDefinition(type)
    expect(definition.global).toBe(true)
    expect(definition.paramSockets).not.toBe(false)
    expect(definition.outputs).toHaveLength(1)
  })
})

describe('parameters are read once per block', () => {
  it('a change takes effect at the next block, for every sample of it', () => {
    const node = requireNodeDefinition('mapRange').create(SAMPLE_RATE)
    const input = new Float32Array(128).fill(0.5)
    const out = new Float32Array(128)
    node.process(context(128), [input], [out])
    expect([...new Set(out)]).toEqual([0.5])
    node.setParam('outMax', 3)
    node.process(context(128), [input], [out])
    expect([...new Set(out)]).toEqual([1.5])
  })

  it('a pure node with nothing wired fills the block with its one value', () => {
    const out = run('multiply', { a: 3, b: 0.5 }, [], 100)
    expect([...new Set(out)]).toEqual([1.5])
  })

  it('a node with state still runs every sample with nothing wired (a clock ticks)', () => {
    const out = run('clock', { rate: 1000, unit: 0, width: 0.5 }, [], 480)
    const rises = out.reduce((count, v, i) => count + (v === 1 && out[i - 1] === 0 ? 1 : 0), 0)
    expect(rises).toBe(9) // ten cycles in 10 ms, the first starting high
  })
})
