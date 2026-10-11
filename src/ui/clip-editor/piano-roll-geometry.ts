import type { Note } from '@core'

export const KEY_WIDTH = 48
export const RULER_HEIGHT = 22
export const ROW_HEIGHT = 16
export const LOW_PITCH = 0
export const HIGH_PITCH = 127
export const BEATS_PER_BAR = 4

export const MIN_ZOOM = 16
export const MAX_ZOOM = 200
export const DEFAULT_ZOOM = 56

export const GRID_OPTIONS = [
  { label: '1/16', beats: 0.25 },
  { label: '1/8', beats: 0.5 },
  { label: '1/4', beats: 1 },
  { label: '1/2', beats: 2 },
  { label: 'Bar', beats: 4 },
] as const

/** Highest pitch first, matching how the keyboard is drawn top to bottom. */
export const pitchRows = (): number[] =>
  Array.from({ length: HIGH_PITCH - LOW_PITCH + 1 }, (_, index) => HIGH_PITCH - index)

export const rowOfPitch = (pitch: number): number => HIGH_PITCH - pitch

/** Pitch of the row at vertical offset `y` from the top of the note area. */
export const pitchAtY = (y: number): number =>
  Math.min(HIGH_PITCH, Math.max(LOW_PITCH, HIGH_PITCH - Math.floor(y / ROW_HEIGHT)))

const BLACK_KEYS = new Set([1, 3, 6, 8, 10])
export const isBlackKey = (pitch: number): boolean => BLACK_KEYS.has(pitch % 12)

/** Middle of the clip's note range, or middle C when empty. */
export const centerPitch = (notes: readonly Note[]): number => {
  if (notes.length === 0) return 60
  const pitches = notes.map((note) => note.pitch)
  return Math.round((Math.min(...pitches) + Math.max(...pitches)) / 2)
}

/** Scroll offset that vertically centres `pitch` in a viewport of `viewportHeight`. */
export const scrollTopFor = (pitch: number, viewportHeight: number): number =>
  Math.max(0, RULER_HEIGHT + rowOfPitch(pitch) * ROW_HEIGHT - viewportHeight / 2)

export const clampZoom = (pixelsPerBeat: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pixelsPerBeat))
