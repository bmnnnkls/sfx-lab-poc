import { describe, expect, it } from 'vitest'
import { type Patch, type PatchNode, addNode, canConnect, connect, createNode, describeNode, kindsConnect, setNodeName, setNodeParam } from '.'

const empty: Patch = { nodes: [], connections: [] }
const build = <T extends string[]>(...types: T) => {
  const nodes = types.map((type) => createNode(type, 0, 0)) as { [K in keyof T]: PatchNode }
  return { nodes, patch: (nodes as PatchNode[]).reduce(addNode, empty) }
}

describe('connection kinds with control', () => {
  it('a control meets controls and mono signals, either way; never stereo or notes', () => {
    expect(kindsConnect('control', 'control')).toBe(true)
    expect(kindsConnect('control', 'signal')).toBe(true)
    expect(kindsConnect('signal', 'control')).toBe(true)
    expect(kindsConnect(undefined, 'control')).toBe(true)
    expect(kindsConnect('control', undefined)).toBe(true)
    for (const other of ['stereo', 'notes'] as const) {
      expect(kindsConnect('control', other), other).toBe(false)
      expect(kindsConnect(other, 'control'), other).toBe(false)
    }
  })

  it('the old rules are unchanged', () => {
    expect(kindsConnect('signal', 'signal')).toBe(true)
    expect(kindsConnect('signal', 'stereo')).toBe(true)
    expect(kindsConnect('stereo', 'signal')).toBe(false)
    expect(kindsConnect('notes', 'notes')).toBe(true)
    expect(kindsConnect('notes', 'signal')).toBe(false)
  })
})

describe('parameter sockets in a patch', () => {
  it('describeNode lists a node own ports first, then its sockets, and the same shape every time', () => {
    const { nodes } = build('filter')
    const shape = describeNode(nodes[0]!)!
    expect(shape.inputs.slice(0, 2).map((port) => port.id)).toEqual(['in', 'cutoff'])
    expect(shape.inputs.slice(2).every((port) => port.param !== undefined)).toBe(true)
    expect(describeNode(nodes[0]!)).toBe(shape)
  })

  it('a control can be wired into a socket and a signal too, but not a socket into a socket', () => {
    const { nodes, patch } = build('control', 'lfo', 'filter', 'gain')
    const [control, lfo, filter, gain] = nodes
    const socket = { node: filter.id, port: 'param:resonance' }
    expect(canConnect(patch, { node: control.id, port: 'out' }, socket)).toBe(true)
    expect(canConnect(patch, { node: lfo.id, port: 'out' }, socket)).toBe(true)
    expect(canConnect(patch, { node: gain.id, port: 'out' }, socket)).toBe(true)
    expect(canConnect(patch, { node: control.id, port: 'out' }, { node: filter.id, port: 'param:nonsense' })).toBe(false)
    expect(canConnect(patch, { node: control.id, port: 'out' }, { node: filter.id, port: 'param:mode' })).toBe(false)
  })

  it('a control output also feeds an ordinary signal input, as a constant', () => {
    const { nodes, patch } = build('control', 'oscillator')
    expect(canConnect(patch, { node: nodes[0]!.id, port: 'out' }, { node: nodes[1]!.id, port: 'freq' })).toBe(true)
  })

  it('a wire into a socket cannot close a loop', () => {
    const { nodes, patch } = build('add', 'filter')
    const [add, filter] = nodes
    const wired = connect(patch, { node: add.id, port: 'out' }, { node: filter.id, port: 'param:cutoff' })
    expect(wired.connections).toHaveLength(1)
    expect(canConnect(wired, { node: filter.id, port: 'out' }, { node: add.id, port: 'param:a' })).toBe(false)
    expect(canConnect(wired, { node: filter.id, port: 'out' }, { node: add.id, port: 'a' })).toBe(false)
  })

  it('a stereo node keeps its sockets mono', () => {
    const { nodes } = build('gain')
    const shape = describeNode({ ...nodes[0]!, stereo: true })!
    expect(shape.inputs.find((port) => port.id === 'param:gain')?.kind).toBe('control')
  })

  it('note nodes have sockets for their numeric parameters too (see note-controls.test.ts)', () => {
    const shape = describeNode(createNode('transpose', 0, 0))!
    expect(shape.inputs.filter((port) => port.param !== undefined).map((port) => port.param)).toEqual(['semitones'])
  })
})

describe('node names', () => {
  it('sets, trims and clears a name; the same patch when nothing changes', () => {
    const { nodes, patch } = build('oscillator', 'gain')
    const id = nodes[0]!.id
    const named = setNodeName(patch, id, '  Lead  ')
    expect(named.nodes[0]!.name).toBe('Lead')
    expect(named.nodes[1]).toBe(patch.nodes[1])
    expect(setNodeName(named, id, 'Lead')).toBe(named)
    const cleared = setNodeName(named, id, '   ')
    expect('name' in cleared.nodes[0]!).toBe(false)
    expect(setNodeName(cleared, id, '')).toBe(cleared)
    expect(setNodeName(patch, 'missing', 'x')).toBe(patch)
  })

  it('caps a name at 60 characters, and other edits keep it', () => {
    const { nodes, patch } = build('oscillator')
    const named = setNodeName(patch, nodes[0]!.id, 'x'.repeat(100))
    expect(named.nodes[0]!.name).toHaveLength(60)
    expect(setNodeParam(named, nodes[0]!.id, 'detune', 3).nodes[0]!.name).toHaveLength(60)
  })
})
