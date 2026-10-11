import { describe, expect, it } from 'vitest'
import { type ModuleDefinition, type Patch, connect, createModuleUse, describeNode, exposePort, flattenPatch, noteGraphFrom } from '../patch'
import { SampleBank } from '../sample'
import { FxGraph } from './fx-graph'

const SAMPLE_RATE = 48000
const FRAMES = 128

const sine = (frequency: number, blocks = 12) =>
  Float32Array.from({ length: blocks * FRAMES }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE))
const run = (patch: Patch, input: Float32Array): Float32Array => {
  const graph = new FxGraph(patch, SAMPLE_RATE, new SampleBank())
  const out = new Float32Array(input.length)
  for (let at = 0; at < input.length; at += FRAMES) out.set(graph.process(input.subarray(at, at + FRAMES), FRAMES).subarray(0, FRAMES), at)
  return out
}
const rms = (buffer: Float32Array) => Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length)

/** A module of one filter whose cutoff is driven by a control inside it. */
const withInnerControl = (value = 440): ModuleDefinition => ({
  id: 'm',
  name: 'Tone',
  patch: noteGraphFrom(
    [{ id: 'f', type: 'filter' }, { id: 'k', type: 'control', params: { value, min: 20, max: 20000, curve: 1 } }],
    ['k.out>f.param:cutoff'],
  ),
  inputs: [{ id: 'f:in', label: 'In', inner: { node: 'f', port: 'in' } }],
  outputs: [{ id: 'f:out', label: 'Out', inner: { node: 'f', port: 'out' } }],
  knobs: [],
})

const around = (definition: ModuleDefinition, params: Record<string, number> = {}) => {
  const use = { ...createModuleUse(definition, 0, 0), id: 'u', params }
  const base = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }], [])
  const patch: Patch = {
    nodes: [...base.nodes, use],
    connections: [
      { id: 'w1', from: { node: 'in', port: 'out' }, to: { node: 'u', port: 'f:in' } },
      { id: 'w2', from: { node: 'u', port: 'f:out' }, to: { node: 'out', port: 'in' } },
    ],
  }
  return flattenPatch(patch, [definition])
}

describe('a control inside a module drives the module, per use', () => {
  const input = sine(4000)

  it('each use has its own value: a low cutoff on one, a high one on another, from one definition', () => {
    const definition = withInnerControl()
    const dark = rms(run(around(definition, { 'k:value': 200 }), input))
    const bright = rms(run(around(definition, { 'k:value': 12000 }), input))
    expect(bright).toBeGreaterThan(dark * 20)
  })

  it('a use that has not turned it plays the module\'s own value', () => {
    const definition = withInnerControl(12000)
    expect(run(around(definition), input)).toEqual(run(around(definition, { 'k:value': 12000 }), input))
  })

  it('and changing the module\'s value moves every use that has not turned it', () => {
    expect(rms(run(around(withInnerControl(12000)), input))).toBeGreaterThan(rms(run(around(withInnerControl(200)), input)) * 20)
  })
})

describe('a parameter socket exposed as a module input', () => {
  const input = sine(4000)

  it('the parent can wire a control into it, and it sounds as if the control were wired inside', () => {
    const definition = exposePort(
      { ...withInnerControl(), patch: noteGraphFrom([{ id: 'f', type: 'filter' }], []), inputs: [{ id: 'f:in', label: 'In', inner: { node: 'f', port: 'in' } }] },
      'inputs',
      { node: 'f', port: 'param:cutoff' },
      'Cutoff',
    )
    const use = { ...createModuleUse(definition, 0, 0), id: 'u' }
    const base = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'out', type: 'trackOut' }, { id: 'c', type: 'control', params: { value: 300, min: 20, max: 20000 } }], [])
    let patch: Patch = { nodes: [...base.nodes, use], connections: [] }
    const wire = (from: string, fromPort: string, to: string, toPort: string) => {
      patch = connect(patch, { node: from, port: fromPort }, { node: to, port: toPort }, { modules: [definition] })
    }
    wire('in', 'out', 'u', 'f:in')
    wire('u', 'f:out', 'out', 'in')
    wire('c', 'out', 'u', 'f:param:cutoff')
    expect(patch.connections).toHaveLength(3)
    const flat = flattenPatch(patch, [definition])
    expect(flat.connections.find((c) => c.to.port === 'param:cutoff')).toMatchObject({ from: { node: 'c' }, to: { node: 'u/f', port: 'param:cutoff' } })

    const direct = noteGraphFrom(
      [{ id: 'in', type: 'trackIn' }, { id: 'f', type: 'filter' }, { id: 'out', type: 'trackOut' }, { id: 'c', type: 'control', params: { value: 300, min: 20, max: 20000 } }],
      ['in.out>f.in', 'f.out>out.in', 'c.out>f.param:cutoff'],
    )
    expect(run(flat, input)).toEqual(run(direct, input))
    expect(rms(run(flat, input))).toBeLessThan(rms(input) * 0.1) // and 300 Hz really is dark for a 4 kHz tone
  })

  it('the exposed socket is a control port on the module, so a signal or control fits and sound does not fit the wrong way', () => {
    const inner: ModuleDefinition = {
      id: 'm2', name: 'F', patch: noteGraphFrom([{ id: 'f', type: 'filter' }], []), inputs: [], outputs: [], knobs: [],
    }
    const definition = exposePort(inner, 'inputs', { node: 'f', port: 'param:resonance' }, 'Res')
    const shape = describeNodeOf(definition)
    expect(shape).toEqual([{ id: 'f:param:resonance', label: 'Res', kind: 'control' }])
  })
})

const describeNodeOf = (definition: ModuleDefinition) =>
  describeNode(createModuleUse(definition, 0, 0), [definition])!.inputs
