import { describe, expect, it } from 'vitest'
import { NoteGraph } from '../notefx'
import type { NoteEvent } from '../session'
import { type Patch, addNode, connect, createNode, describeNode, engineNoteGraph, moduleDomain, noteGraphFrom, setNodeParam } from '.'

const on = (beat: number, pitch: number): NoteEvent => ({ beat, kind: 'noteOn', pitch, velocity: 0.8 })
const pitches = (events: NoteEvent[]) => events.flatMap((e) => (e.kind === 'noteOn' ? [e.pitch] : []))

/** clip notes -> transpose -> to instrument, with a control driving the transpose. */
const graph = (value: number, extra: Parameters<typeof noteGraphFrom>[0] = [], wires: string[] = []): Patch =>
  noteGraphFrom(
    [{ id: 'clip', type: 'clipNotes' }, { id: 't', type: 'transpose' }, { id: 'out', type: 'noteOut' }, { id: 'k', type: 'control', params: { value, min: -24, max: 24, step: 1 } }, ...extra],
    ['clip.out>t.in', 't.out>out.in', 'k.out>t.param:semitones', ...wires],
  )

const play = (patch: Patch) => {
  const noteGraph = new NoteGraph()
  noteGraph.sync(engineNoteGraph(patch, []))
  return noteGraph.process([on(0, 60)], 0, 4, new Map())
}

describe('note nodes have parameter sockets', () => {
  it('one per numeric parameter, none for a choice, with the words of the parameter', () => {
    const shape = describeNode(createNode('transpose', 0, 0))!
    expect(shape.inputs.map((port) => port.id)).toEqual(['in', 'param:semitones'])
    expect(shape.inputs[1]).toMatchObject({ kind: 'control', param: 'semitones', range: { min: -24, max: 24, default: 0 } })
    expect(shape.inputs[1]!.description).toBeTruthy()
    const scale = describeNode(createNode('scaleLock', 0, 0))!
    expect(scale.inputs.map((port) => port.id)).toEqual(['in']) // root and scale are both choices
  })

  it('a control can be wired into one; the note wires keep their kinds', () => {
    const patch = graph(7)
    expect(patch.connections).toHaveLength(3)
    const refused = connect(patch, { node: 'clip', port: 'out' }, { node: 't', port: 'param:semitones' })
    expect(refused).toBe(patch) // notes do not fit a control socket
  })
})

describe('the engine plays a note graph with controls in it', () => {
  it('a control into a socket sounds as the value typed in', () => {
    const driven = play(graph(12))
    const typed = play(noteGraphFrom([{ id: 'clip', type: 'clipNotes' }, { id: 't', type: 'transpose', params: { semitones: 12 } }, { id: 'out', type: 'noteOut' }], ['clip.out>t.in', 't.out>out.in']))
    expect(pitches(driven)).toEqual([72])
    expect(driven).toEqual(typed)
  })

  it('the control\'s own range and step apply, and so does the parameter\'s', () => {
    expect(pitches(play(graph(99)))).toEqual([84]) // held at the control's max 24
    expect(pitches(play(graph(-3.4)))).toEqual([57]) // snapped to -3
    const wide = noteGraphFrom([{ id: 'clip', type: 'clipNotes' }, { id: 't', type: 'transpose' }, { id: 'out', type: 'noteOut' }, { id: 'k', type: 'control', params: { value: 100, min: 0, max: 1000 } }], ['clip.out>t.in', 't.out>out.in', 'k.out>t.param:semitones'])
    expect(pitches(play(wide))).toEqual([84]) // and the transpose's own range 24
  })

  it('works through math: a control through Add into the socket', () => {
    const patch = graph(7, [{ id: 'a', type: 'add', params: { b: 5 } }], [])
    const wired: Patch = {
      ...patch,
      connections: [...patch.connections.filter((c) => c.from.node !== 'k'), { id: 'w1', from: { node: 'k', port: 'out' }, to: { node: 'a', port: 'a' } }, { id: 'w2', from: { node: 'a', port: 'out' }, to: { node: 't', port: 'param:semitones' } }],
    }
    expect(pitches(play(wired))).toEqual([72]) // 7 + 5 = 12 semitones
  })

  it('the engine graph has only note nodes and note wires', () => {
    const baked = engineNoteGraph(graph(12), [])
    expect(baked.nodes.map((node) => node.id).sort()).toEqual(['clip', 'out', 't'])
    expect(baked.connections.map((c) => `${c.from.node}>${c.to.node}`).sort()).toEqual(['clip>t', 't>out'])
    expect(baked.nodes.find((node) => node.id === 't')!.params.semitones).toBe(12)
  })

  it('a graph without controls is passed through untouched (same object)', () => {
    const plain = noteGraphFrom([{ id: 'clip', type: 'clipNotes' }, { id: 'out', type: 'noteOut' }], ['clip.out>out.in'])
    expect(engineNoteGraph(plain, [])).toBe(plain)
  })

  it('turning the control changes the parameter and does not restart the graph (no all-notes-off)', () => {
    const noteGraph = new NoteGraph()
    noteGraph.sync(engineNoteGraph(graph(0), []))
    noteGraph.process([], 0, 4, new Map())
    noteGraph.sync(engineNoteGraph(setNodeParam(graph(0), 'k', 'value', 5), []))
    const events = noteGraph.process([on(4, 60)], 4, 8, new Map())
    expect(events.some((e) => e.kind === 'allOff')).toBe(false)
    expect(pitches(events)).toEqual([65])
  })

  it('wiring a control in is a parameter change too: the same note wiring, no restart', () => {
    const before = noteGraphFrom([{ id: 'clip', type: 'clipNotes' }, { id: 't', type: 'transpose', params: { semitones: 0 } }, { id: 'out', type: 'noteOut' }], ['clip.out>t.in', 't.out>out.in'])
    const after = addNode(before, { ...createNode('control', 0, 0), id: 'k', params: { ...createNode('control', 0, 0).params, value: 3, min: -24, max: 24 } })
    const wired = connect(after, { node: 'k', port: 'out' }, { node: 't', port: 'param:semitones' })
    const noteGraph = new NoteGraph()
    noteGraph.sync(engineNoteGraph(before, []))
    noteGraph.process([], 0, 4, new Map())
    noteGraph.sync(engineNoteGraph(wired, []))
    const events = noteGraph.process([on(4, 60)], 4, 8, new Map())
    expect(events.some((e) => e.kind === 'allOff')).toBe(false)
    expect(pitches(events)).toEqual([63])
  })
})

describe('controls in a note graph and modules', () => {
  it('a control and math fit a note graph and a sound patch alike, so they do not decide what a module is for', () => {
    const inner = noteGraphFrom([{ id: 'k', type: 'control' }, { id: 'a', type: 'add' }], ['k.out>a.a'])
    expect(moduleDomain({ id: 'm', name: 'M', patch: inner, inputs: [], outputs: [], knobs: [] }, [])).toBeUndefined()
    const withTranspose = noteGraphFrom([{ id: 'k', type: 'control' }, { id: 't', type: 'transpose' }], [])
    expect(moduleDomain({ id: 'm', name: 'M', patch: withTranspose, inputs: [], outputs: [], knobs: [] }, [])).toBe('notes')
    const withOsc = noteGraphFrom([{ id: 'k', type: 'control' }, { id: 'o', type: 'oscillator' }], [])
    expect(moduleDomain({ id: 'm', name: 'M', patch: withOsc, inputs: [], outputs: [], knobs: [] }, [])).toBe('audio')
  })
})
