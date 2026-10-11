import { describe, expect, it } from 'vitest'
import {
  createNote,
  moveNotes,
  notesInRegion,
  pasteNotes,
  removeNotes,
  resizeNotesEnd,
  resizeNotesStart,
  setVelocity,
  shiftedCopies,
  snapDown,
  trimNotesToLength,
} from './note-edit'

const ids = (...notes: { id: string }[]) => new Set(notes.map((note) => note.id))

describe('snapDown', () => {
  it('snaps to the grid, tolerating float error just under a boundary', () => {
    expect(snapDown(1.3, 0.5)).toBe(1)
    expect(snapDown(1.5, 0.5)).toBe(1.5)
    expect(snapDown(0.7499999999999, 0.25)).toBe(0.75)
    expect(snapDown(0, 0.25)).toBe(0)
  })
})

describe('moveNotes', () => {
  const a = createNote(60, 1, 1)
  const b = createNote(64, 2, 2)
  const other = createNote(40, 0, 1)
  const notes = [a, b, other]

  it('moves only the selected notes, in time and pitch', () => {
    const moved = moveNotes(notes, ids(a), 0.5, 2, 8)
    expect(moved[0]).toMatchObject({ start: 1.5, pitch: 62, duration: 1 })
    expect(moved[1]).toBe(b)
    expect(moved[2]).toBe(other)
  })

  it('moves a group as a unit, stopping it at the clip edges', () => {
    const early = moveNotes(notes, ids(a, b), -10, 0, 8)
    expect(early.map((n) => n.start)).toEqual([0, 1, 0]) // a hit 0, b kept its distance from a

    const late = moveNotes(notes, ids(a, b), 10, 0, 8)
    expect(late.map((n) => n.start)).toEqual([5, 6, 0]) // b ends at 8
  })

  it('keeps pitches inside the MIDI range as a group', () => {
    const high = moveNotes(notes, ids(a, b), 0, 100, 8)
    expect(high[1]!.pitch).toBe(127)
    expect(high[0]!.pitch).toBe(123) // same 4-semitone gap as before
    expect(moveNotes(notes, ids(other), 0, -100, 8)[2]!.pitch).toBe(0)
  })

  it('does nothing when nothing is selected', () => {
    expect(moveNotes(notes, new Set(), 1, 1, 8)).toEqual(notes)
  })
})

describe('resizing', () => {
  const note = createNote(60, 2, 2)

  it('moves the end, with a minimum length and the clip end as limits', () => {
    expect(resizeNotesEnd([note], ids(note), 1, 0.25, 8)[0]!.duration).toBe(3)
    expect(resizeNotesEnd([note], ids(note), -5, 0.25, 8)[0]!.duration).toBe(0.25)
    expect(resizeNotesEnd([note], ids(note), 100, 0.25, 8)[0]!.duration).toBe(6) // 2 + 6 = clip end
  })

  it('moves the start while the end stays put', () => {
    expect(resizeNotesStart([note], ids(note), -1, 0.25)[0]).toMatchObject({ start: 1, duration: 3 })
    expect(resizeNotesStart([note], ids(note), -100, 0.25)[0]).toMatchObject({ start: 0, duration: 4 })
    expect(resizeNotesStart([note], ids(note), 100, 0.25)[0]).toMatchObject({ start: 3.75, duration: 0.25 })
  })
})

describe('clip trimming and copying', () => {
  const notes = [createNote(60, 0, 1), createNote(62, 3, 4), createNote(64, 5, 1)]

  it('trims notes that no longer fit', () => {
    const trimmed = trimNotesToLength(notes, 4)
    expect(trimmed.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [60, 0, 1],
      [62, 3, 1],
    ])
  })

  it('copies notes with fresh ids at an offset', () => {
    const copies = shiftedCopies(notes, 8)
    expect(copies.map((n) => n.start)).toEqual([8, 11, 13])
    expect(new Set([...notes, ...copies].map((n) => n.id)).size).toBe(6)
  })

  it('removes by id', () => {
    expect(removeNotes(notes, ids(notes[1]!))).toHaveLength(2)
  })
})

describe('velocity', () => {
  const a = createNote(60, 0, 1, 0.5)
  const b = createNote(62, 1, 1, 0.5)

  it('sets the velocity of the chosen notes, clamped to a sensible range', () => {
    const result = setVelocity([a, b], ids(a), 0.9)
    expect(result[0]!.velocity).toBe(0.9)
    expect(result[1]).toBe(b)
    expect(setVelocity([a], ids(a), 5)[0]!.velocity).toBe(1)
    expect(setVelocity([a], ids(a), -1)[0]!.velocity).toBeGreaterThan(0)
  })
})

describe('notesInRegion', () => {
  const low = createNote(48, 0, 1)
  const mid = createNote(60, 2, 2)
  const high = createNote(72, 5, 1)
  const notes = [low, mid, high]

  it('selects notes overlapping a time/pitch rectangle', () => {
    expect([...notesInRegion(notes, { fromBeat: 1.5, toBeat: 2.5, lowPitch: 55, highPitch: 65 })]).toEqual([mid.id])
    expect(notesInRegion(notes, { fromBeat: 0, toBeat: 10, lowPitch: 0, highPitch: 127 }).size).toBe(3)
  })

  it('counts a note that only touches the region by its tail, but not one that merely abuts it', () => {
    expect(notesInRegion(notes, { fromBeat: 3, toBeat: 3.5, lowPitch: 60, highPitch: 60 }).has(mid.id)).toBe(true)
    expect(notesInRegion(notes, { fromBeat: 4, toBeat: 5, lowPitch: 60, highPitch: 60 }).size).toBe(0)
  })
})

describe('pasteNotes', () => {
  const copied = [createNote(60, 1, 1), createNote(64, 2, 1)]

  it('lands the earliest copied note at the target beat, keeping spacing and pitches', () => {
    const { notes, pastedIds } = pasteNotes([], copied, 4, 16)
    expect(notes.map((n) => [n.pitch, n.start])).toEqual([[60, 4], [64, 5]])
    expect(pastedIds.size).toBe(2)
    expect(copied.every((n) => !pastedIds.has(n.id))).toBe(true) // fresh ids
  })

  it('drops what would start past the end of the clip and trims overruns', () => {
    const { notes } = pasteNotes([], [createNote(60, 0, 2), createNote(62, 3, 1)], 3, 4)
    expect(notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([[60, 3, 1]])
  })

  it('keeps existing notes and does nothing for an empty clipboard', () => {
    const existing = createNote(40, 0, 1)
    expect(pasteNotes([existing], [], 2, 8).notes).toEqual([existing])
    expect(pasteNotes([existing], copied, 2, 8).notes[0]).toBe(existing)
  })
})
