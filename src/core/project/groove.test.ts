import { describe, expect, it } from 'vitest'
import { humanizeNotes, quantizeNotes, swingNotes } from './groove'
import { createNote } from './note-edit'
import type { Note } from './types'

const all = (notes: readonly Note[]) => new Set(notes.map((note) => note.id))
const starts = (notes: readonly Note[]) => notes.map((note) => +note.start.toFixed(4))

/** A tiny deterministic generator so jitter is reproducible in tests. */
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 2 ** 32
}

describe('quantizeNotes', () => {
  const loose = [createNote(60, 0.07, 0.4), createNote(62, 0.62, 0.4), createNote(64, 1.9, 0.4)]
  const options = { step: 0.5, strength: 1, ends: false }

  it('snaps starts onto the grid and keeps lengths', () => {
    const result = quantizeNotes(loose, all(loose), options, 4)
    expect(starts(result)).toEqual([0, 0.5, 2])
    expect(result.map((n) => n.duration)).toEqual([0.4, 0.4, 0.4])
  })

  it('is idempotent at full strength', () => {
    const once = quantizeNotes(loose, all(loose), options, 4)
    expect(quantizeNotes(once, all(once), options, 4)).toEqual(once)
  })

  it('moves only part of the way at lower strength', () => {
    const half = quantizeNotes(loose, all(loose), { ...options, strength: 0.5 }, 4)
    expect(starts(half)).toEqual([0.035, 0.56, 1.95])
    const none = quantizeNotes(loose, all(loose), { ...options, strength: 0 }, 4)
    expect(starts(none)).toEqual(starts(loose))
  })

  it('can pull note ends onto the grid too, never below one step or one note length', () => {
    const note = createNote(60, 0.1, 0.9) // 0.1 .. 1.0
    const [result] = quantizeNotes([note], all([note]), { ...options, ends: true }, 4)
    expect(result!.start).toBe(0)
    expect(result!.duration).toBe(1) // end 1.0 is already on the grid

    const tiny = createNote(60, 0.1, 0.05)
    const [t] = quantizeNotes([tiny], all([tiny]), { ...options, ends: true }, 4)
    expect(t!.duration).toBeGreaterThanOrEqual(0.05)
  })

  it('touches only the chosen notes', () => {
    const [a, b] = loose
    const result = quantizeNotes(loose, all([a!]), options, 4)
    expect(result[0]!.start).toBe(0)
    expect(result[1]).toBe(b)
  })

  it('keeps notes inside the clip when rounding would push them past the end', () => {
    const late = createNote(60, 3.9, 0.4)
    const [result] = quantizeNotes([late], all([late]), options, 4)
    expect(result!.start + result!.duration).toBeLessThanOrEqual(4)
  })
})

describe('swingNotes', () => {
  const straight = [0, 0.5, 1, 1.5].map((start) => createNote(60, start, 0.25))

  it('delays every other grid position and leaves the rest', () => {
    const result = swingNotes(straight, all(straight), 0.5, 66.67, 4)
    expect(starts(result)).toEqual([0, 0.6667, 1, 1.6667])
  })

  it('does nothing at 50 percent (straight)', () => {
    expect(starts(swingNotes(straight, all(straight), 0.5, 50, 4))).toEqual(starts(straight))
  })

  it('is idempotent: swinging twice equals swinging once, at every amount', () => {
    for (const percent of [50, 55, 62, 66.67, 70, 75]) {
      const once = swingNotes(straight, all(straight), 0.5, percent, 4)
      expect(swingNotes(once, all(once), 0.5, percent, 4), `${percent}%`).toEqual(once)
    }
  })

  it('stays idempotent for a note swung exactly half a step (the 75% extreme)', () => {
    // 75% delays the off-beat by half a step, landing it midway between two grid positions.
    const once = swingNotes(straight, all(straight), 0.5, 75, 4)
    expect(starts(once)).toEqual([0, 0.75, 1, 1.75])
    expect(starts(swingNotes(once, all(once), 0.5, 75, 4))).toEqual([0, 0.75, 1, 1.75])
  })

  it('re-swings correctly when the amount changes', () => {
    const at75 = swingNotes(straight, all(straight), 0.5, 75, 4)
    const at50 = swingNotes(at75, all(at75), 0.5, 50, 4)
    expect(starts(at50)).toEqual(starts(straight))
  })

  it('first snaps sloppy notes to the grid before swinging them', () => {
    const sloppy = [createNote(60, 0.04, 0.2), createNote(60, 0.55, 0.2)]
    expect(starts(swingNotes(sloppy, all(sloppy), 0.5, 66.67, 4))).toEqual([0, 0.6667])
  })

  it('limits the amount to a hard shuffle and keeps notes inside the clip', () => {
    const note = createNote(60, 3.5, 0.5)
    const [hard] = swingNotes([note], all([note]), 0.5, 99, 4)
    expect(hard!.start + hard!.duration).toBeLessThanOrEqual(4)
    const [normal] = swingNotes([createNote(60, 0.5, 0.2)], new Set([...all([note])]), 0.5, 75, 4)
    expect(normal).toBeDefined()
  })
})

describe('humanizeNotes', () => {
  const grid = [0, 1, 2, 3].map((start) => createNote(60, start, 0.5, 0.8))

  it('does nothing with zero amounts', () => {
    const result = humanizeNotes(grid, all(grid), { step: 0.5, timing: 0, velocity: 0 }, 4, seeded(1))
    expect(starts(result)).toEqual(starts(grid))
    expect(result.map((n) => n.velocity)).toEqual(grid.map((n) => n.velocity))
  })

  it('wanders by at most the stated amount and stays inside the clip', () => {
    const result = humanizeNotes(grid, all(grid), { step: 0.5, timing: 1, velocity: 1 }, 4, seeded(7))
    for (const [index, note] of result.entries()) {
      const original = grid[index]!
      expect(Math.abs(note.start - original.start)).toBeLessThanOrEqual(0.25 + 1e-9)
      expect(Math.abs(note.velocity - original.velocity)).toBeLessThanOrEqual(0.25 + 1e-9)
      expect(note.start).toBeGreaterThanOrEqual(0)
      expect(note.start + note.duration).toBeLessThanOrEqual(4 + 1e-9)
      expect(note.velocity).toBeGreaterThan(0)
      expect(note.velocity).toBeLessThanOrEqual(1)
    }
  })

  it('actually varies things, and is reproducible for the same random source', () => {
    const a = humanizeNotes(grid, all(grid), { step: 0.5, timing: 1, velocity: 1 }, 4, seeded(3))
    const b = humanizeNotes(grid, all(grid), { step: 0.5, timing: 1, velocity: 1 }, 4, seeded(3))
    expect(a).toEqual(b)
    expect(new Set(a.map((n) => n.velocity)).size).toBeGreaterThan(1)
    expect(starts(a)).not.toEqual(starts(grid))
  })

  it('leaves unselected notes alone and keeps them the same objects', () => {
    const [first] = grid
    const result = humanizeNotes(grid, all([first!]), { step: 0.5, timing: 1, velocity: 1 }, 4, seeded(5))
    expect(result[1]).toBe(grid[1])
  })

  it('cannot push a note that fills the clip out of it', () => {
    const full = createNote(60, 0, 4)
    const [result] = humanizeNotes([full], all([full]), { step: 0.5, timing: 1, velocity: 0 }, 4, seeded(9))
    expect(result!.start).toBe(0)
  })
})
