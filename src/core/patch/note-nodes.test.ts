import { describe, expect, it } from 'vitest'
import { connect, createNode, setNodeBypassed, setNodeTrack, clearTrackReferences, addNode } from './edit'
import { createDefaultNoteGraph } from './default-note-graph'
import { groupIntoModule } from './group-module'
import { describeNode, moduleDomain } from './node-shape'
import { noteGraphFrom } from './note-graph-builder'
import { createDefaultPatch } from './default-patch'
import type { Patch } from './types'

describe('note nodes in a patch', () => {
  it('are described like any other node, with ports of kind notes', () => {
    const split = describeNode(createNode('rangeSplit', 0, 0))!
    expect(split.inputs.filter((p) => p.param === undefined).map((p) => [p.id, p.kind])).toEqual([['in', 'notes']])
    expect(split.outputs.map((p) => p.id)).toEqual(['inside', 'outside'])
    expect(split.domain).toBe('notes')
    expect(describeNode(createNode('trackNotes', 0, 0))!.usesTrack).toBe('notes')
    expect(describeNode(createNode('arpeggiator', 0, 0))!.bypassable).toBe(true)
    expect(describeNode(createNode('rangeSplit', 0, 0))!.bypassable).toBe(false) // two outputs: nothing sensible to pass through
    expect(describeNode(createNode('oscillator', 0, 0))!.domain).toBeUndefined()
  })

  it('connect only joins ports of the same kind', () => {
    let patch: Patch = { nodes: [], connections: [] }
    const clip = createNode('clipNotes', 0, 0)
    const osc = createNode('oscillator', 0, 0)
    const gain = createNode('gain', 0, 0)
    const out = createNode('noteOut', 0, 0)
    patch = [clip, osc, gain, out].reduce(addNode, patch)
    expect(connect(patch, { node: clip.id, port: 'out' }, { node: gain.id, port: 'in' }).connections).toHaveLength(0)
    expect(connect(patch, { node: osc.id, port: 'out' }, { node: out.id, port: 'in' }).connections).toHaveLength(0)
    expect(connect(patch, { node: clip.id, port: 'out' }, { node: out.id, port: 'in' }).connections).toHaveLength(1)
    expect(connect(patch, { node: osc.id, port: 'out' }, { node: gain.id, port: 'in' }).connections).toHaveLength(1)
  })

  it('an output can feed several inputs and an input can take several sources', () => {
    const graph = noteGraphFrom(
      [{ id: 'c', type: 'clipNotes' }, { id: 'a', type: 'transpose' }, { id: 'b', type: 'transpose' }, { id: 'o', type: 'noteOut' }],
      [],
    )
    const wire = (p: Patch, from: string, to: string) => connect(p, { node: from, port: 'out' }, { node: to, port: 'in' })
    const split = wire(wire(wire(wire(graph, 'c', 'a'), 'c', 'b'), 'a', 'o'), 'b', 'o')
    expect(split.connections).toHaveLength(4)
  })

  it('refuses a loop in a note graph', () => {
    const graph = noteGraphFrom([{ id: 'a', type: 'transpose' }, { id: 'b', type: 'transpose' }], ['a.out>b.in'])
    expect(connect(graph, { node: 'b', port: 'out' }, { node: 'a', port: 'in' }).connections).toHaveLength(1)
  })

  it('the default graph is the clip notes wired straight to the instrument', () => {
    const graph = createDefaultNoteGraph()
    expect(graph.nodes.map((n) => n.type)).toEqual(['clipNotes', 'noteOut'])
    expect(graph.connections).toHaveLength(1)
  })

  it('track references and bypass are set and cleared without touching other nodes', () => {
    const graph = noteGraphFrom([{ id: 't', type: 'trackNotes' }, { id: 'x', type: 'transpose' }], [])
    const tapped = setNodeTrack(graph, 't', 'track_1')
    expect(tapped.nodes[0]!.trackId).toBe('track_1')
    expect(setNodeTrack(tapped, 't', null).nodes[0]!.trackId).toBeUndefined()
    expect(clearTrackReferences(tapped, 'track_1').nodes[0]!.trackId).toBeUndefined()
    expect(clearTrackReferences(tapped, 'other')).toBe(tapped)

    const off = setNodeBypassed(graph, 'x', true)
    expect(off.nodes[1]!.bypassed).toBe(true)
    expect(setNodeBypassed(off, 'x', false).nodes[1]!.bypassed).toBeUndefined()
    expect(setNodeBypassed(off, 'x', true)).toBe(off)
  })
})

describe('modules of notes', () => {
  const noteGraph = () =>
    noteGraphFrom(
      [{ id: 'c', type: 'clipNotes' }, { id: 'a', type: 'transpose' }, { id: 'b', type: 'chord' }, { id: 'o', type: 'noteOut' }],
      ['c.out>a.in', 'a.out>b.in', 'b.out>o.in'],
    )

  it('grouping gives a module whose ports are of kind notes, and whose domain is notes', () => {
    const { module, patch, use } = groupIntoModule(noteGraph(), ['a', 'b'], 'Box', [])!
    expect(moduleDomain(module, [module])).toBe('notes')
    const shape = describeNode(use, [module])!
    expect(shape.inputs[0]!.kind).toBe('notes')
    expect(shape.outputs[0]!.kind).toBe('notes')
    expect(shape.domain).toBe('notes')
    // so the rest of the graph is still connected through it, and sound cannot be wired in
    expect(patch.connections).toHaveLength(2)
    const osc = createNode('oscillator', 0, 0)
    const withOsc = addNode(patch, osc)
    expect(connect(withOsc, { node: osc.id, port: 'out' }, { node: use.id, port: shape.inputs[0]!.id }, { modules: [module] }).connections).toHaveLength(2)
  })

  it('a module of sound nodes is in the audio domain; an empty one fits anywhere', () => {
    const patch = createDefaultPatch()
    const ids = patch.nodes.filter((n) => n.type === 'oscillator' || n.type === 'filter').map((n) => n.id)
    const { module } = groupIntoModule(patch, ids, 'Sound', [])!
    expect(moduleDomain(module, [module])).toBe('audio')
    expect(moduleDomain({ ...module, patch: { nodes: [], connections: [] } }, [])).toBeUndefined()
  })
})
