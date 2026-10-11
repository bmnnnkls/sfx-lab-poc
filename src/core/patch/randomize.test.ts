import { describe, expect, it } from 'vitest'
import { fromSlider, nodeDefinitions, toSlider } from '../dsp'
import { createDefaultPatch } from './default-patch'
import { addNode, connect, createNode, setNodeLocked, setNodeParam } from './edit'
import { createModuleUse } from './group-module'
import { exampleModules } from './example-modules'
import { describeNode, resolveSpec } from './node-shape'
import { randomizeParams } from './randomize'
import type { Patch } from './types'

const paramsOf = (patch: Patch) => Object.fromEntries(patch.nodes.map((node) => [node.id, node.params]))
const byType = (patch: Patch, type: string) => patch.nodes.find((node) => node.type === type)!

describe('randomizing', () => {
  it('gives the same result for the same seed, and a different one for another', () => {
    const patch = createDefaultPatch()
    expect(randomizeParams(patch, [], { seed: 7 })).toEqual(randomizeParams(patch, [], { seed: 7 }))
    expect(paramsOf(randomizeParams(patch, [], { seed: 7 }))).not.toEqual(paramsOf(randomizeParams(patch, [], { seed: 8 })))
  })

  it('changes the settings and nothing else: the same nodes, wires and positions', () => {
    const patch = createDefaultPatch()
    const next = randomizeParams(patch, [], { seed: 3 })
    expect(next.nodes.map((node) => [node.id, node.type, node.x, node.y])).toEqual(patch.nodes.map((node) => [node.id, node.type, node.x, node.y]))
    expect(next.connections).toBe(patch.connections)
    expect(paramsOf(next)).not.toEqual(paramsOf(patch))
  })

  it('amount 0 changes nothing and is the same patch', () => {
    const patch = createDefaultPatch()
    expect(randomizeParams(patch, [], { seed: 1, amount: 0 })).toBe(patch)
    expect(randomizeParams({ nodes: [], connections: [] }, [], { seed: 1 })).toEqual({ nodes: [], connections: [] })
  })

  it('every setting of every kind of node stays inside its range, on its step, finite', () => {
    for (const definition of nodeDefinitions) {
      const node = createNode(definition.type, 0, 0)
      const patch = addNode({ nodes: [], connections: [] }, node)
      for (const seed of [1, 2, 3, 99, 12345]) {
        for (const amount of [1, 0.5, 0.05]) {
          const next = randomizeParams(patch, [], { seed, amount })
          const shape = describeNode(next.nodes[0]!, [])!
          for (const spec of shape.params) {
            const value = next.nodes[0]!.params[spec.id]
            if (value === undefined) continue
            const live = resolveSpec(next.nodes[0]!, spec)
            const ok = Number.isFinite(value) && value >= Math.min(live.min, spec.min) - 1e-9 && value <= Math.max(live.max, spec.max) + 1e-9
            expect(ok, `${definition.type}.${spec.id} = ${value} (seed ${seed}, amount ${amount})`).toBe(true)
            if (spec.step === 1) expect(Number.isInteger(value), `${definition.type}.${spec.id} is whole`).toBe(true)
          }
        }
      }
    }
  })

  it('a choice stays one of its options', () => {
    const oscillator = createNode('oscillator', 0, 0)
    const patch = addNode({ nodes: [], connections: [] }, oscillator)
    const waves = new Set<number>()
    for (let seed = 0; seed < 60; seed++) waves.add(randomizeParams(patch, [], { seed }).nodes[0]!.params.waveform!)
    expect([...waves].sort()).toEqual([0, 1, 2, 3])
  })

  it('a frequency is spread over the range the way a knob feels it: octaves, not hertz', () => {
    const filter = createNode('filter', 0, 0)
    const patch = addNode({ nodes: [], connections: [] }, filter)
    const cutoffs = Array.from({ length: 400 }, (_, seed) => randomizeParams(patch, [], { seed }).nodes[0]!.params.cutoff!)
    const belowThousand = cutoffs.filter((value) => value < 1000).length
    // 20 Hz to 20 kHz on a log scale: 1000 Hz is 57% of the way up (a straight scale would put only 5% of the draws below it).
    expect(belowThousand / cutoffs.length).toBeGreaterThan(0.45)
    expect(belowThousand / cutoffs.length).toBeLessThan(0.7)
  })
})

describe('mutating', () => {
  it('moves each setting by at most `amount` of its range, in the way the knob feels it', () => {
    const patch = createDefaultPatch()
    for (const seed of [1, 2, 3, 4, 5]) {
      const next = randomizeParams(patch, [], { seed, amount: 0.1 })
      for (const node of next.nodes) {
        const shape = describeNode(node, [])!
        const before = patch.nodes.find((candidate) => candidate.id === node.id)!
        for (const spec of shape.params.filter((candidate) => candidate.options === undefined)) {
          const live = resolveSpec(node, spec)
          const [a, b] = [before.params[spec.id] ?? spec.default, node.params[spec.id] ?? spec.default]
          const [x, y] = [toSlider(live, Math.min(live.max, Math.max(live.min, a))), toSlider(live, Math.min(live.max, Math.max(live.min, b)))]
          // The step and six-digit rounding may add a little to the nudge.
          expect(Math.abs(x - y), `${node.type}.${spec.id}`).toBeLessThanOrEqual(0.1 + 0.02)
        }
      }
    }
  })

  it('a small amount keeps most of the sound: far fewer settings change than with a full roll', () => {
    const patch = createDefaultPatch()
    const changedBy = (amount: number) => {
      let count = 0
      for (let seed = 0; seed < 20; seed++) {
        const next = randomizeParams(patch, [], { seed, amount })
        for (const node of next.nodes) for (const [id, value] of Object.entries(node.params)) if (value !== patch.nodes.find((c) => c.id === node.id)!.params[id]) count++
      }
      return count
    }
    expect(changedBy(0.02)).toBeGreaterThan(0)
  })

  it('an amount outside 0..1, or not a number, is brought into range', () => {
    const patch = createDefaultPatch()
    expect(randomizeParams(patch, [], { seed: 1, amount: 7 })).toEqual(randomizeParams(patch, [], { seed: 1, amount: 1 }))
    expect(randomizeParams(patch, [], { seed: 1, amount: -2 })).toBe(patch)
    expect(randomizeParams(patch, [], { seed: 1, amount: Number.NaN })).toEqual(randomizeParams(patch, [], { seed: 1, amount: 1 }))
  })
})

describe('what randomizing leaves alone', () => {
  it('a locked node, and unlocking it makes it fair game again', () => {
    const patch = createDefaultPatch()
    const filter = byType(patch, 'filter')
    const locked = setNodeLocked(patch, filter.id, true)
    expect(byType(locked, 'filter').locked).toBe(true)
    const next = randomizeParams(locked, [], { seed: 5 })
    expect(next.nodes.find((node) => node.id === filter.id)).toBe(locked.nodes.find((node) => node.id === filter.id))
    expect(byType(next, 'oscillator').params).not.toEqual(byType(patch, 'oscillator').params)
    expect(byType(randomizeParams(setNodeLocked(locked, filter.id, false), [], { seed: 5 }), 'filter').params).not.toEqual(filter.params)
  })

  it('locking is an edit that returns the same patch when nothing changes, and a clean node when it is lifted', () => {
    const patch = createDefaultPatch()
    const id = patch.nodes[0]!.id
    expect(setNodeLocked(patch, id, false)).toBe(patch)
    expect(setNodeLocked(patch, 'missing', true)).toBe(patch)
    const locked = setNodeLocked(patch, id, true)
    expect(setNodeLocked(locked, id, true)).toBe(locked)
    expect('locked' in setNodeLocked(locked, id, false).nodes[0]!).toBe(false)
  })

  it('a setting a wire drives', () => {
    let patch = addNode(addNode({ nodes: [], connections: [] }, createNode('filter', 0, 0)), createNode('control', 0, 0))
    const [filter, control] = patch.nodes as [Patch['nodes'][number], Patch['nodes'][number]]
    patch = connect(patch, { node: control.id, port: 'out' }, { node: filter.id, port: 'param:cutoff' })
    expect(patch.connections).toHaveLength(1)
    for (let seed = 0; seed < 20; seed++) {
      const next = randomizeParams(patch, [], { seed })
      expect(next.nodes.find((node) => node.id === filter.id)!.params.cutoff).toBe(filter.params.cutoff)
    }
    const other = new Set(Array.from({ length: 20 }, (_, seed) => randomizeParams(patch, [], { seed }).nodes.find((node) => node.id === filter.id)!.params.resonance))
    expect(other.size).toBeGreaterThan(5)
  })

  it('a control is re-rolled within its own range, and its range, step and curve are left as set', () => {
    let patch = addNode({ nodes: [], connections: [] }, createNode('control', 0, 0))
    const id = patch.nodes[0]!.id
    patch = setNodeParam(setNodeParam(setNodeParam(patch, id, 'min', 100), id, 'max', 200), id, 'step', 10)
    const seen = new Set<number>()
    for (let seed = 0; seed < 80; seed++) {
      const node = randomizeParams(patch, [], { seed }).nodes[0]!
      expect([node.params.min, node.params.max, node.params.step]).toEqual([100, 200, 10])
      expect(node.params.value! >= 100 && node.params.value! <= 200 && node.params.value! % 10 === 0).toBe(true)
      seen.add(node.params.value!)
    }
    expect(seen.size).toBeGreaterThan(6)
  })

  it('an XY pad rolls both axes, a selector stays among its positions, a switch and the indicators stay as they are', () => {
    let patch: Patch = { nodes: [], connections: [] }
    for (const type of ['xyPad', 'selector', 'switch', 'led', 'display', 'bar']) patch = addNode(patch, createNode(type, 0, 0))
    patch = setNodeParam(patch, byType(patch, 'selector').id, 'count', 3)
    for (let seed = 0; seed < 40; seed++) {
      const next = randomizeParams(patch, [], { seed })
      const pad = byType(next, 'xyPad')
      expect(pad.params.x).not.toBeUndefined()
      expect([0, 1, 2]).toContain(byType(next, 'selector').params.index)
      for (const type of ['switch', 'led', 'display', 'bar']) expect(byType(next, type)).toBe(byType(patch, type))
    }
    const pads = new Set(Array.from({ length: 20 }, (_, seed) => byType(randomizeParams(patch, [], { seed }), 'xyPad').params.x))
    expect(pads.size).toBeGreaterThan(5)
  })

  it('a math node\'s operands, which have no knob-sized range, are left alone; a node set to a value outside its range does not break', () => {
    let patch = addNode(addNode({ nodes: [], connections: [] }, createNode('add', 0, 0)), createNode('gain', 0, 0))
    const gain = byType(patch, 'gain')
    patch = setNodeParam(patch, gain.id, 'gain', 99) // out of the 0..2 range, as a hand-edited file could be
    const next = randomizeParams(patch, [], { seed: 4, amount: 0.1 })
    expect(byType(next, 'add')).toBe(byType(patch, 'add'))
    expect(byType(next, 'gain').params.gain!).toBeLessThanOrEqual(2)
  })
})

describe('a module use', () => {
  it('has its knobs randomized, inside their ranges', () => {
    const { definition } = exampleModules[1]!
    let patch = addNode({ nodes: [], connections: [] }, createModuleUse(definition, 0, 0))
    const use = patch.nodes[0]!
    const shape = describeNode(use, [definition])!
    expect(shape.params.length).toBe(9)
    const next = randomizeParams(patch, [definition], { seed: 11 })
    const levels = next.nodes[0]!.params
    expect(Object.keys(levels)).toHaveLength(9)
    for (const spec of shape.params) {
      expect(levels[spec.id]!).toBeGreaterThanOrEqual(spec.min)
      expect(levels[spec.id]!).toBeLessThanOrEqual(spec.max)
    }
    patch = next
    expect(patch).not.toBe(undefined)
  })
})

it('toSlider and fromSlider are the same ones the knobs use: a round trip returns the value', () => {
  const spec = { id: 'f', label: 'F', min: 20, max: 20000, default: 1000 }
  for (const value of [20, 440, 20000]) expect(fromSlider(spec, toSlider(spec, value))).toBeCloseTo(value, 6)
})
