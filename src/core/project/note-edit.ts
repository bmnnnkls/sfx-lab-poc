import { clamp, createId } from '../shared'
import type { Note } from './types'

export const MIN_PITCH = 0
export const MAX_PITCH = 127
export const DEFAULT_VELOCITY = 0.9

export const createNote = (
  pitch: number,
  start: number,
  duration: number,
  velocity: number = DEFAULT_VELOCITY,
): Note => ({ id: createId('note'), pitch, start, duration, velocity })

/** Largest multiple of `step` not above `value` (tolerates float error just below a boundary). */
export const snapDown = (value: number, step: number): number =>
  Math.floor(value / step + 1e-9) * step

const bounds = (notes: readonly Note[]) => ({
  minStart: Math.min(...notes.map((note) => note.start)),
  maxEnd: Math.max(...notes.map((note) => note.start + note.duration)),
  minPitch: Math.min(...notes.map((note) => note.pitch)),
  maxPitch: Math.max(...notes.map((note) => note.pitch)),
})

/**
 * Moves the notes in `ids` together. The group moves as one: it is stopped at the clip's
 * start/end and the MIDI range rather than squashing or reordering its notes.
 */
export const moveNotes = (
  notes: readonly Note[],
  ids: ReadonlySet<string>,
  deltaBeats: number,
  deltaPitch: number,
  lengthBeats: number,
): Note[] => {
  const selected = notes.filter((note) => ids.has(note.id))
  if (selected.length === 0) return [...notes]

  const { minStart, maxEnd, minPitch, maxPitch } = bounds(selected)
  const beats = Math.max(-minStart, Math.min(lengthBeats - maxEnd, deltaBeats))
  const semitones = clamp(deltaPitch, MIN_PITCH - minPitch, MAX_PITCH - maxPitch)

  return notes.map((note) =>
    ids.has(note.id)
      ? { ...note, start: note.start + beats, pitch: note.pitch + semitones }
      : note,
  )
}

/** Moves the end of each selected note, keeping at least `minDuration` and staying inside the clip. */
export const resizeNotesEnd = (
  notes: readonly Note[],
  ids: ReadonlySet<string>,
  deltaBeats: number,
  minDuration: number,
  lengthBeats: number,
): Note[] =>
  notes.map((note) =>
    ids.has(note.id)
      ? {
          ...note,
          duration: Math.max(
            Math.min(minDuration, note.duration),
            Math.min(lengthBeats - note.start, note.duration + deltaBeats),
          ),
        }
      : note,
  )

/** Moves the start of each selected note while its end stays put. */
export const resizeNotesStart = (
  notes: readonly Note[],
  ids: ReadonlySet<string>,
  deltaBeats: number,
  minDuration: number,
): Note[] =>
  notes.map((note) => {
    if (!ids.has(note.id)) return note
    const end = note.start + note.duration
    const floor = Math.min(minDuration, note.duration)
    const start = Math.max(0, Math.min(end - floor, note.start + deltaBeats))
    return { ...note, start, duration: end - start }
  })

export const removeNotes = (notes: readonly Note[], ids: ReadonlySet<string>): Note[] =>
  notes.filter((note) => !ids.has(note.id))

/** Drops notes that start at or after the new end and shortens ones that run past it. */
export const trimNotesToLength = (notes: readonly Note[], lengthBeats: number): Note[] =>
  notes
    .filter((note) => note.start < lengthBeats)
    .map((note) =>
      note.start + note.duration > lengthBeats
        ? { ...note, duration: lengthBeats - note.start }
        : note,
    )

/** Copies of `notes` (with fresh ids) shifted later by `offsetBeats`. */
export const shiftedCopies = (notes: readonly Note[], offsetBeats: number): Note[] =>
  notes.map((note) => ({ ...note, id: createId('note'), start: note.start + offsetBeats }))

/** True when both lists hold the same notes (same ids and values, in order). */
export const notesEqual = (a: readonly Note[], b: readonly Note[]): boolean =>
  a.length === b.length &&
  a.every((note, index) => {
    const other = b[index]
    return (
      other !== undefined &&
      note.id === other.id &&
      note.pitch === other.pitch &&
      note.start === other.start &&
      note.duration === other.duration &&
      note.velocity === other.velocity
    )
  })

export const MIN_VELOCITY = 0.02

/** Sets the velocity (0..1) of the notes in `ids`. */
export const setVelocity = (
  notes: readonly Note[],
  ids: ReadonlySet<string>,
  velocity: number,
): Note[] =>
  notes.map((note) =>
    ids.has(note.id) ? { ...note, velocity: clamp(velocity, MIN_VELOCITY, 1) } : note,
  )

export interface NoteRegion {
  readonly fromBeat: number
  readonly toBeat: number
  readonly lowPitch: number
  readonly highPitch: number
}

/** Ids of notes that overlap a time and pitch region (for rubber-band selection). */
export const notesInRegion = (notes: readonly Note[], region: NoteRegion): Set<string> =>
  new Set(
    notes
      .filter(
        (note) =>
          note.start < region.toBeat &&
          note.start + note.duration > region.fromBeat &&
          note.pitch >= region.lowPitch &&
          note.pitch <= region.highPitch,
      )
      .map((note) => note.id),
  )

/**
 * Pastes `copied` so its earliest note lands at `atBeat`, keeping pitches and spacing. Copies get
 * fresh ids; anything that would start past the clip end is dropped and overruns are trimmed.
 */
export const pasteNotes = (
  notes: readonly Note[],
  copied: readonly Note[],
  atBeat: number,
  lengthBeats: number,
): { notes: Note[]; pastedIds: Set<string> } => {
  if (copied.length === 0) return { notes: [...notes], pastedIds: new Set() }
  const first = Math.min(...copied.map((note) => note.start))
  const offset = Math.max(0, atBeat) - first
  const pasted = trimNotesToLength(shiftedCopies(copied, offset), lengthBeats)
  return { notes: [...notes, ...pasted], pastedIds: new Set(pasted.map((note) => note.id)) }
}
