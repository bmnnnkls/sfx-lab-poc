import { describe, expect, it } from 'vitest'
import { SampleBank } from '../../sample'
import { requireNodeDefinition } from '../registry'

const context = (frames: number) => ({
  frames,
  sampleRate: 48000,
  note: { frequency: 440, velocity: 1, gate: false, trigger: 0 },
  samples: new SampleBank(),
})

/** One block through a node; returns each output. */
const run = (type: string, params: Record<string, number>, frames = 128) => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(48000)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  const outputs = definition.outputs.map(() => new Float32Array(128).fill(-9))
  node.process(context(frames), [], outputs)
  return outputs
}

describe('control', () => {
  it('outputs its real value, constant over the block, and leaves the rest of the buffer alone', () => {
    const [out] = run('control', { value: 440, min: 20, max: 20000 }, 64)
    expect([...out!.subarray(0, 64)].every((v) => v === 440)).toBe(true)
    expect(out![64]).toBe(-9)
  })

  it('keeps the value inside its own range, whichever way round the limits are given', () => {
    expect(run('control', { value: 5, min: 0, max: 1 })[0]![0]).toBe(1)
    expect(run('control', { value: -5, min: 0, max: 1 })[0]![0]).toBe(0)
    expect(run('control', { value: 5, min: 10, max: 0 })[0]![0]).toBe(5)
    expect(run('control', { value: 50, min: 10, max: 0 })[0]![0]).toBe(10)
  })

  it('snaps to its step, counted from the lowest value', () => {
    expect(run('control', { value: 0.4, min: 0, max: 127, step: 1 })[0]![0]).toBe(0)
    expect(run('control', { value: 60.6, min: 0, max: 127, step: 1 })[0]![0]).toBe(61)
    expect(run('control', { value: 1.3, min: 0.5, max: 4.5, step: 1 })[0]![0]).toBeCloseTo(1.5, 6)
    expect(run('control', { value: 3.1, min: 0, max: 1, step: 0 })[0]![0]).toBe(1)
  })

  it('has no sockets of its own and one control output', () => {
    const definition = requireNodeDefinition('control')
    expect(definition.paramSockets).toBe(false)
    expect(definition.outputs).toEqual([{ id: 'out', label: 'Out', kind: 'control' }])
  })
})

describe('xyPad', () => {
  it('outputs two values, each in its own range', () => {
    const [x, y] = run('xyPad', { x: 0.25, xMin: 0, xMax: 1, y: 3000, yMin: 100, yMax: 2000 })
    expect(x![0]).toBeCloseTo(0.25, 6)
    expect(y![0]).toBe(2000)
  })

  it('steps each axis on its own', () => {
    const [x, y] = run('xyPad', { x: 0.4, xStep: 0.5, y: 0.4, yStep: 0 })
    expect(x![0]).toBe(0.5)
    expect(y![0]).toBeCloseTo(0.4, 6)
  })
})

describe('switch', () => {
  it('outputs 1 while on and 0 while off', () => {
    expect(run('switch', { on: 1 })[0]![0]).toBe(1)
    expect(run('switch', { on: 0 })[0]![0]).toBe(0)
  })

  it('keeps its mode for the panel without it changing the output', () => {
    const definition = requireNodeDefinition('switch')
    expect(definition.params.find((spec) => spec.id === 'mode')?.options).toEqual(['toggle', 'momentary'])
    expect(run('switch', { on: 1, mode: 1 })[0]![0]).toBe(1)
  })
})
