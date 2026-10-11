import { describe, expect, it } from 'vitest'
import { createDefaultNoteGraph, noteGraphFrom } from '../patch'
import { createClip, createNote } from '../project'
import { heardNotes } from './heard-notes'

/** clip notes -> the given effects in a row -> instrument. */
const chain = (...effects: [string, Record<string, number>?][]) => {
  const nodes = [
    { id: 'c', type: 'clipNotes' },
    ...effects.map(([type, params], index) => ({ id: `e${index}`, type, params })),
    { id: 'o', type: 'noteOut' },
  ]
  const wires = nodes.slice(1).map((node, index) => `${nodes[index]!.id}.${index === 0 ? 'out' : 'out'}>${node.id}.in`)
  return noteGraphFrom(nodes, wires)
}

const chordClip = () => createClip('Chord', 4, [createNote(60, 0, 4), createNote(64, 0, 4), createNote(67, 0, 4)])

describe('heardNotes', () => {
  it('with the default graph shows the clip as written', () => {
    const clip = createClip('A', 4, [createNote(60, 0, 1), createNote(64, 2, 0.5)])
    expect(heardNotes(clip, createDefaultNoteGraph()).map(({ pitch, start, duration }) => ({ pitch, start, duration }))).toEqual([
      { pitch: 60, start: 0, duration: 1 },
      { pitch: 64, start: 2, duration: 0.5 },
    ])
  })

  it('an arpeggiator turns a held chord into steps', () => {
    const notes = heardNotes(chordClip(), chain(['arpeggiator', { rate: 1, gate: 0.5 }]))
    expect(notes).toHaveLength(8)
    expect(notes.map((note) => note.pitch).slice(0, 4)).toEqual([60, 64, 67, 60])
    expect(notes.every((note) => Math.abs(note.duration - 0.25) < 1e-9)).toBe(true)
  })

  it('a chord effect multiplies notes, scale lock moves them', () => {
    const one = createClip('One', 4, [createNote(64, 0, 1)])
    expect(heardNotes(one, chain(['chord', { chord: 2 }])).map((n) => n.pitch)).toEqual([64, 68, 71])
    expect(heardNotes(one, chain(['scaleLock', { root: 0, scale: 1 }])).map((n) => n.pitch)).toEqual([63])
  })

  it('a split graph plays both branches', () => {
    const graph = noteGraphFrom(
      [{ id: 'c', type: 'clipNotes' }, { id: 'up', type: 'transpose', params: { semitones: 12 } }, { id: 'o', type: 'noteOut' }],
      ['c.out>o.in', 'c.out>up.in', 'up.out>o.in'],
    )
    const one = createClip('One', 4, [createNote(60, 0, 1)])
    expect(heardNotes(one, graph).map((n) => n.pitch).sort()).toEqual([60, 72])
  })

  it('echo repeats at the end of the clip show up at the start of the loop', () => {
    const clip = createClip('Late', 4, [createNote(60, 3.5, 0.25)])
    const notes = heardNotes(clip, chain(['echo', { time: 1, repeats: 2, decay: 0.5 }]))
    expect(notes.map((note) => note.start)).toEqual([0, 0.5, 3.5])
  })

  it('does not depend on being run before: the same answer every time', () => {
    const graph = chain(['arpeggiator', { pattern: 4, rate: 2 }])
    expect(heardNotes(chordClip(), graph)).toEqual(heardNotes(chordClip(), graph))
  })
})
