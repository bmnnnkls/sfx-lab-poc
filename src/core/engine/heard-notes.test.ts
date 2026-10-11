import { describe, expect, it } from 'vitest'
import type { NoteEffect } from '../notefx'
import { createClip, createNote } from '../project'
import { heardNotes } from './heard-notes'

const effect = (type: string, params: Record<string, number> = {}): NoteEffect => ({ id: type, type, params, bypassed: false })

const chordClip = () =>
  createClip('Chord', 4, [createNote(60, 0, 4), createNote(64, 0, 4), createNote(67, 0, 4)])

describe('heardNotes', () => {
  it('without effects shows the clip as written', () => {
    const clip = createClip('A', 4, [createNote(60, 0, 1), createNote(64, 2, 0.5)])
    expect(heardNotes(clip, []).map(({ pitch, start, duration }) => ({ pitch, start, duration }))).toEqual([
      { pitch: 60, start: 0, duration: 1 },
      { pitch: 64, start: 2, duration: 0.5 },
    ])
  })

  it('an arpeggiator turns a held chord into steps', () => {
    const notes = heardNotes(chordClip(), [effect('arpeggiator', { rate: 1, gate: 0.5 })])
    expect(notes).toHaveLength(8)
    expect(notes.map((note) => note.pitch).slice(0, 4)).toEqual([60, 64, 67, 60])
    expect(notes.every((note) => Math.abs(note.duration - 0.25) < 1e-9)).toBe(true)
  })

  it('a chord effect multiplies notes, scale lock moves them', () => {
    const one = createClip('One', 4, [createNote(64, 0, 1)])
    expect(heardNotes(one, [effect('chord', { chord: 2 })]).map((n) => n.pitch)).toEqual([64, 68, 71])
    expect(heardNotes(one, [effect('scaleLock', { root: 0, scale: 1 })]).map((n) => n.pitch)).toEqual([63])
  })

  it('echo repeats at the end of the clip show up at the start of the loop', () => {
    const clip = createClip('Late', 4, [createNote(60, 3.5, 0.25)])
    const notes = heardNotes(clip, [effect('echo', { time: 1, repeats: 2, decay: 0.5 })])
    expect(notes.map((note) => note.start)).toEqual([0, 0.5, 3.5]) // the repeats at 4 and 4.5 wrap round to 0 and 0.5
  })

  it('does not depend on being run before: the same answer every time', () => {
    const effects = [effect('arpeggiator', { pattern: 4, rate: 2 })]
    expect(heardNotes(chordClip(), effects)).toEqual(heardNotes(chordClip(), effects))
  })
})
