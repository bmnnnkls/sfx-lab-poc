import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../../sample'
import { requireNodeDefinition } from '../../registry'

const RATE = 48000
const BLOCK = 128

const context = (frames: number) => ({
  frames,
  sampleRate: RATE,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

/**
 * Runs a node over the given input signals (one array per input port, in port order, as long as you like; ports you leave out
 * stay unwired) in blocks of 128, and returns its output.
 */
const run = (type: string, params: Record<string, number>, inputs: readonly (readonly number[] | null)[] = [], length?: number): number[] => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(RATE)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const total = length ?? Math.max(0, ...inputs.map((input) => input?.length ?? 0))
  const out: number[] = []
  for (let start = 0; start < total; start += BLOCK) {
    const frames = Math.min(BLOCK, total - start)
    const buffers = inputs.map((input) => (input ? Float32Array.from({ length: frames }, (_, i) => input[start + i] ?? 0) : null))
    const output = new Float32Array(BLOCK)
    node.process(context(frames), buffers, [output])
    out.push(...output.subarray(0, frames))
  }
  return out
}

/** A signal that is `value` for each run of samples: `levels([[0, 10], [1, 5]])` is ten zeros then five ones. */
const levels = (parts: readonly (readonly [number, number])[]): number[] => parts.flatMap(([value, count]) => Array<number>(count).fill(value))
const risesAt = (data: readonly number[]) => data.flatMap((v, i) => (v > 0.5 && (data[i - 1] ?? 0) <= 0.5 ? [i] : []))

describe('schmitt trigger', () => {
  it('turns on at High, stays on in the gap, and turns off only at Low', () => {
    const input = [0, 0.3, 0.5, 0.7, 0.5, 0.45, 0.3, 0.5, 0.7]
    expect(run('schmitt', { high: 0.6, low: 0.4 }, [input])).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 1])
  })

  it('does not chatter on a signal wobbling around one threshold', () => {
    const wobble = Array.from({ length: 400 }, (_, i) => 0.5 + 0.08 * Math.sin(i))
    const out = run('schmitt', { high: 0.6, low: 0.4 }, [wobble])
    expect(out.every((v) => v === 0)).toBe(true)
    const noisy = Array.from({ length: 400 }, (_, i) => 0.62 + 0.1 * Math.sin(i))
    expect(run('schmitt', { high: 0.6, low: 0.4 }, [noisy]).filter((v) => v === 1).length).toBeGreaterThan(300)
  })

  it('takes the two levels either way round, and from wires', () => {
    expect(run('schmitt', { high: 0.4, low: 0.6 }, [[0, 0.7, 0.5, 0.3]])).toEqual([0, 1, 1, 0])
    expect(run('schmitt', {}, [[0, 5, 5, 0], [10, 4, 4, 4], [0, 1, 1, 1]])).toEqual([0, 1, 1, 0])
  })
})

describe('edge detect', () => {
  const input = levels([[0, 300], [1, 300], [0, 300]])

  it('pulses for the Pulse time after a rise, a fall, or either', () => {
    const rising = run('edge', { mode: 0, pulse: 0.001 }, [input])
    expect(risesAt(rising)).toEqual([300])
    expect(rising.filter((v) => v === 1)).toHaveLength(48)
    expect(risesAt(run('edge', { mode: 1, pulse: 0.001 }, [input]))).toEqual([600])
    expect(risesAt(run('edge', { mode: 2, pulse: 0.001 }, [input]))).toEqual([300, 600])
  })

  it('does not fire for a signal that starts high, and is silent on a steady one', () => {
    expect(run('edge', { mode: 2 }, [levels([[1, 500]])]).every((v) => v === 0)).toBe(true)
    expect(run('edge', { mode: 2 }, [levels([[0, 500]])]).every((v) => v === 0)).toBe(true)
  })

  it('a pulse is at least one sample, however short it is asked to be', () => {
    expect(risesAt(run('edge', { mode: 0, pulse: 0.0001 }, [input]))).toEqual([300])
  })
})

describe('flip-flop', () => {
  it('flips on every rise of Trigger and not while it stays high', () => {
    const trigger = levels([[0, 10], [1, 10], [0, 10], [1, 10], [0, 10], [1, 10]])
    const out = run('flipFlop', {}, [trigger])
    expect([out[5], out[15], out[25], out[35], out[45], out[55]]).toEqual([0, 1, 1, 0, 0, 1])
  })

  it('a rise of Reset turns it off', () => {
    const trigger = levels([[0, 5], [1, 5], [0, 20]])
    const reset = levels([[0, 15], [1, 5], [0, 10]])
    const out = run('flipFlop', {}, [trigger, reset])
    expect(out[9]).toBe(1)
    expect(out[14]).toBe(1)
    expect(out[16]).toBe(0)
    expect(out[29]).toBe(0)
  })
})

describe('counter', () => {
  const pulses = (count: number) => Array.from({ length: count }, () => levels([[1, 4], [0, 4]])).flat()

  it('counts the rises from 0', () => {
    const out = run('counter', {}, [pulses(5)])
    expect([out[0], out[3], out[7], out[8], out[16], out[39]]).toEqual([1, 1, 1, 2, 3, 5])
  })

  it('wraps at Limit and goes back to 0 on Reset', () => {
    const wrapped = run('counter', { limit: 3 }, [pulses(7)])
    expect(new Set(wrapped)).toEqual(new Set([0, 1, 2]))
    expect(wrapped.at(-1)).toBe(1)
    const reset = run('counter', {}, [pulses(4), levels([[0, 20], [1, 4], [0, 8]])])
    expect(reset[19]).toBe(3)
    expect(reset[21]).toBe(0)
  })
})

describe('clock', () => {
  const second = RATE

  it('ticks Rate times a second, high for Width of each cycle', () => {
    const out = run('clock', { rate: 4, width: 0.25 }, [], second)
    expect(risesAt(out)).toHaveLength(4)
    const high = out.filter((v) => v === 1).length
    expect(high / second).toBeCloseTo(0.25, 1)
  })

  it('counts in beats per minute when asked: 120 BPM is 2 a second', () => {
    expect(risesAt(run('clock', { rate: 120, unit: 1 }, [], second))).toHaveLength(2)
    expect(risesAt(run('clock', { rate: 2, unit: 0 }, [], second))).toHaveLength(2)
  })

  it('a rise of Reset restarts the cycle', () => {
    const reset = levels([[0, 20000], [1, 10], [0, 100]])
    const out = run('clock', { rate: 1, width: 0.5 }, [reset], 20110)
    expect(out[20000]).toBe(1)
    expect(out[19990]).toBe(1) // the cycle before the reset was still in its first half
  })
})

describe('clock divider', () => {
  const cycles = (count: number) => Array.from({ length: count }, () => levels([[1, 4], [0, 4]])).flat()

  it('passes the first cycle and then every Nth', () => {
    const out = run('divider', { by: 3 }, [cycles(9)])
    expect(risesAt(out)).toEqual([0, 24, 48])
  })

  it('by 1 passes everything, and Reset starts counting again', () => {
    expect(risesAt(run('divider', { by: 1 }, [cycles(4)]))).toHaveLength(4)
    const reset = levels([[0, 12], [1, 4], [0, 20]])
    const out = run('divider', { by: 4 }, [cycles(4), reset])
    expect(risesAt(out)).toEqual([0, 16])
  })
})

describe('control delay', () => {
  it('repeats the input Time seconds later, and starts as its first value', () => {
    const input = [...levels([[0.5, 100]]), ...levels([[1, 200]])]
    const out = run('controlDelay', { time: 150 / RATE }, [input])
    expect(out.slice(0, 100).every((v) => v === 0.5)).toBe(true)
    expect(out[100 + 149]).toBe(0.5)
    expect(out[100 + 150]).toBe(1)
  })

  it('with no delay it is the input, and the longest delay is held to two seconds', () => {
    const ramp = Array.from({ length: 300 }, (_, i) => i)
    expect(run('controlDelay', { time: 0 }, [ramp])).toEqual(ramp)
    expect(run('controlDelay', { time: 99 }, [ramp]).every(Number.isFinite)).toBe(true)
  })
})

describe('these nodes are global-capable but not note-graph constants', () => {
  it('are built to run once per block, and are kept out of note graphs', () => {
    for (const type of ['schmitt', 'edge', 'flipFlop', 'counter', 'clock', 'divider', 'controlDelay']) {
      const definition = requireNodeDefinition(type)
      expect(definition.global, type).toBe(true)
      expect(definition.inNotes, type).toBeUndefined()
      expect(definition.category, type).toBe('Logic')
    }
  })
})
