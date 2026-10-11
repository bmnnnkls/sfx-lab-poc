import { clamp } from '../shared'
import { MIN_VELOCITY } from './note-edit'
import type { Note } from './types'

export interface QuantizeOptions {
  /** Grid size in beats. */
  readonly step: number
  /** 0 leaves notes where they are, 1 snaps them fully onto the grid. */
  readonly strength: number
  /** Also pull note ends onto the grid (otherwise lengths are kept). */
  readonly ends: boolean
}

/** Moves `value` towards `target` by `strength` (exactly onto it at 1, avoiding float dust). */
const toward = (value: number, target: number, strength: number): number =>
  strength >= 1 ? target : value + (target - value) * strength

/**
 * Snaps the selected notes' starts (and optionally ends) to the grid. A strength below 1 only moves
 * them part of the way, which keeps some of the original feel. At full strength it is idempotent.
 */
export const quantizeNotes = (
  notes: readonly Note[],
  ids: ReadonlySet<string>,
  { step, strength, ends }: QuantizeOptions,
  lengthBeats: number,
): Note[] =>
  notes.map((note) => {
    if (!ids.has(note.id)) return note
    const room = Math.min(step, note.duration)

    const snappedStart = clamp(Math.round(note.start / step) * step, 0, Math.max(0, lengthBeats - room))
    const start = toward(note.start, snappedStart, strength)

    let duration = note.duration
    if (ends) {
      const end = toward(note.start + note.duration, Math.round((note.start + note.duration) / step) * step, strength)
      duration = Math.max(room, end - start)
    }
    return { ...note, start, duration: Math.min(duration, lengthBeats - start) }
  })

const MIN_SWING = 50
const MAX_SWING = 75

/**
 * Swings the selected notes: they are snapped to the grid, then every other grid position is
 * delayed. `percent` is where the second step of each pair lands within the pair: 50 is straight,
 * about 67 is triplet swing, 75 a hard shuffle. Because it re-snaps first, applying it twice gives
 * the same result as applying it once.
 */
export const swingNotes = (
  notes: readonly Note[],
  ids: ReadonlySet<string>,
  step: number,
  percent: number,
  lengthBeats: number,
): Note[] => {
  const delay = (clamp(percent, MIN_SWING, MAX_SWING) / 100 - 0.5) * 2 * step
  /** Where grid slot `index` plays once swung: odd slots are delayed. */
  const slot = (index: number) => index * step + (index % 2 === 1 ? delay : 0)

  return notes.map((note) => {
    if (!ids.has(note.id)) return note

    // Pick the slot the note is closest to *as it currently sits*, delayed or not. Rounding the raw
    // position instead would put a note that is already swung by half a step on the wrong side of
    // the line, so swinging a second time would move it again.
    const nearest = Math.round(note.start / step)
    const index = [nearest - 1, nearest, nearest + 1]
      .filter((candidate) => candidate >= 0)
      .reduce((best, candidate) =>
        Math.abs(note.start - slot(candidate)) < Math.abs(note.start - slot(best)) ? candidate : best,
      )

    const start = Math.min(slot(index), Math.max(0, lengthBeats - Math.min(step, note.duration)))
    return { ...note, start, duration: Math.min(note.duration, lengthBeats - start) }
  })
}

export interface HumanizeOptions {
  /** Grid size in beats; timing jitter is a fraction of it. */
  readonly step: number
  /** 0..1: how far starts may wander, up to half a grid step either way at 1. */
  readonly timing: number
  /** 0..1: how far velocities may wander, up to a quarter of the range either way at 1. */
  readonly velocity: number
}

/**
 * Adds small random variations to timing and velocity so a pattern sounds played rather than
 * programmed. `random` returns values in [0, 1) and is injectable so results can be reproduced.
 */
export const humanizeNotes = (
  notes: readonly Note[],
  ids: ReadonlySet<string>,
  { step, timing, velocity }: HumanizeOptions,
  lengthBeats: number,
  random: () => number = Math.random,
): Note[] => {
  const wobble = () => random() * 2 - 1
  return notes.map((note) => {
    if (!ids.has(note.id)) return note
    const start = clamp(
      note.start + wobble() * timing * step * 0.5,
      0,
      Math.max(0, lengthBeats - note.duration),
    )
    return {
      ...note,
      start,
      velocity: clamp(note.velocity + wobble() * velocity * 0.25, MIN_VELOCITY, 1),
    }
  })
}
