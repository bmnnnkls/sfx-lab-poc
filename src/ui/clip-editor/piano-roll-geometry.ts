import type { Note } from '@core'

export const CELL_WIDTH = 28
export const ROW_HEIGHT = 16
export const LOW_PITCH = 24
export const HIGH_PITCH = 96

export const pitchRows = (): number[] =>
  Array.from({ length: HIGH_PITCH - LOW_PITCH + 1 }, (_, index) => HIGH_PITCH - index)

const BLACK_KEYS = new Set([1, 3, 6, 8, 10])
export const isBlackKey = (pitch: number): boolean => BLACK_KEYS.has(pitch % 12)

/** Notes whose start falls on `step`-aligned cell `column` and cover `pitch`. */
export const findNoteAt = (notes: readonly Note[], pitch: number, beat: number): Note | undefined =>
  notes.find((note) => note.pitch === pitch && beat >= note.start && beat < note.start + note.duration)

/** Toggles a note at a grid cell: removes the note under it, or adds one `step` beats long. */
export const toggleNote = (
  notes: readonly Note[],
  pitch: number,
  beat: number,
  step: number,
): Note[] => {
  const existing = findNoteAt(notes, pitch, beat)
  if (existing) return notes.filter((note) => note !== existing)
  return [...notes, { pitch, start: beat, duration: step, velocity: 0.9 }]
}

/** Middle of the clip's note range, or middle C when empty. */
export const centerPitch = (notes: readonly Note[]): number => {
  if (notes.length === 0) return 60
  const pitches = notes.map((note) => note.pitch)
  return Math.round((Math.min(...pitches) + Math.max(...pitches)) / 2)
}

/** Scroll offset that vertically centers `pitch` in a viewport of `viewportHeight`. */
export const scrollTopFor = (pitch: number, viewportHeight: number): number =>
  Math.max(0, (HIGH_PITCH - pitch) * ROW_HEIGHT - viewportHeight / 2)
