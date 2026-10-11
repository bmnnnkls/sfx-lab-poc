import { type Note, MIN_VELOCITY } from '@core'
import { LANE_HEIGHT } from './piano-roll-geometry'
const PADDING = 6
/** A bar can be grabbed this many pixels either side of where its note starts. */
const HIT_RADIUS = 6

export { LANE_HEIGHT }

/** Velocity (0..1) for a vertical position in the lane: top is loudest. */
export const velocityAtY = (y: number): number => {
  const usable = LANE_HEIGHT - 2 * PADDING
  return Math.min(1, Math.max(MIN_VELOCITY, 1 - (y - PADDING) / usable))
}

/** Where the top of a velocity bar sits in the lane. */
export const barTop = (velocity: number): number => PADDING + (1 - velocity) * (LANE_HEIGHT - 2 * PADDING)

/**
 * The note whose bar the pointer is on. Chords put several bars at one x, so among the bars in
 * reach the one whose top is closest to the pointer wins: pressing at a bar's height grabs that bar.
 */
export const pickNoteAt = (
  notes: readonly Note[],
  x: number,
  y: number,
  pixelsPerBeat: number,
): Note | undefined => {
  let best: Note | undefined
  let bestDistance = Infinity
  for (const note of notes) {
    if (Math.abs(note.start * pixelsPerBeat - x) > HIT_RADIUS) continue
    const distance = Math.abs(barTop(note.velocity) - y)
    if (distance < bestDistance) {
      best = note
      bestDistance = distance
    }
  }
  return best
}
