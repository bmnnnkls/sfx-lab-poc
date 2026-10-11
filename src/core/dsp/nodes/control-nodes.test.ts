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
    expect(definition.outputs).toMatchObject([{ id: 'out', label: 'Out', kind: 'control' }])
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

/** Blocks of one node in a row, so a pulse can be followed across them. `sets` happen before the block of the same index. */
const runBlocks = (type: string, params: Record<string, number>, blocks: readonly (Record<string, number> | undefined)[], frames = 128) => {
  const definition = requireNodeDefinition(type)
  const node = definition.create(48000)
  for (const [id, value] of Object.entries(params)) node.setParam(id, value)
  return blocks.map((sets) => {
    for (const [id, value] of Object.entries(sets ?? {})) node.setParam(id, value)
    const out = new Float32Array(frames)
    node.process(context(frames), [], [out])
    return out
  })
}

describe('switch', () => {
  it('outputs 1 while on and 0 while off', () => {
    expect(run('switch', { on: 1 })[0]![0]).toBe(1)
    expect(run('switch', { on: 0 })[0]![0]).toBe(0)
  })

  it('outputs its own off and on values, which can be anything', () => {
    expect(run('switch', { on: 0, offValue: 220, onValue: 440 })[0]![0]).toBe(220)
    expect(run('switch', { on: 1, offValue: 220, onValue: 440 })[0]![0]).toBe(440)
    expect(run('switch', { on: 1, offValue: 1, onValue: -3 })[0]![0]).toBe(-3)
  })

  it('has three modes for the panel; toggle and momentary differ from a toggle only in how the panel presses them', () => {
    const definition = requireNodeDefinition('switch')
    expect(definition.params.find((spec) => spec.id === 'mode')?.options).toEqual(['toggle', 'momentary', 'trigger'])
    expect(run('switch', { on: 1, mode: 1 })[0]![0]).toBe(1)
  })

  it('as a trigger it pulses for the pulse time after a press, then falls back to the off value although the state stays on', () => {
    // 0.01 s at 48 kHz = 480 samples: three whole blocks of 128 and a part of the fourth.
    const [a, b, c, d, e] = runBlocks('switch', { mode: 2, pulse: 0.01 }, [undefined, { on: 1 }, undefined, undefined, undefined, undefined].slice(0, 6))
    expect([...a!].every((v) => v === 0)).toBe(true)
    expect([...b!].every((v) => v === 1)).toBe(true)
    expect([...c!].every((v) => v === 1)).toBe(true)
    expect([...d!].every((v) => v === 1)).toBe(true)
    expect(e![0]).toBe(1)
    expect(e![127]).toBe(0)
  })

  it('a press shorter than a block is not lost: the state rose and fell before the block ran', () => {
    const [block] = runBlocks('switch', { mode: 2, pulse: 0.005 }, [undefined])
    expect([...block!].every((v) => v === 0)).toBe(true)
    const definition = requireNodeDefinition('switch')
    const node = definition.create(48000)
    node.setParam('mode', 2)
    node.setParam('pulse', 0.005)
    node.setParam('on', 1)
    node.setParam('on', 0)
    const out = new Float32Array(128)
    node.process(context(128), [], [out])
    expect(out[0]).toBe(1)
    expect(out[127]).toBe(1)
  })

  it('pulses again on the next press, not while the state just stays on', () => {
    const blocks = runBlocks('switch', { mode: 2, pulse: 0.001 }, [{ on: 1 }, undefined, { on: 0 }, undefined, { on: 1 }])
    const high = blocks.map((block) => block.some((v) => v === 1))
    expect(high).toEqual([true, false, false, false, true])
  })

  it('does not pulse when a toggle is turned on', () => {
    const [block, next] = runBlocks('switch', { mode: 0 }, [{ on: 1 }, undefined])
    expect([...block!].every((v) => v === 1)).toBe(true)
    expect([...next!].every((v) => v === 1)).toBe(true)
  })
})

describe('selector', () => {
  it('outputs the number of the chosen position, from 0', () => {
    expect(run('selector', { index: 0 })[0]![0]).toBe(0)
    expect(run('selector', { index: 2, count: 4 })[0]![0]).toBe(2)
  })

  it('keeps the position inside the positions it has, and never outputs NaN', () => {
    expect(run('selector', { index: 9, count: 4 })[0]![0]).toBe(3)
    expect(run('selector', { index: -3, count: 4 })[0]![0]).toBe(0)
    expect(run('selector', { index: 2.6, count: 4 })[0]![0]).toBe(3)
    expect(run('selector', { index: Number.NaN, count: 4 })[0]![0]).toBe(0)
  })
})
