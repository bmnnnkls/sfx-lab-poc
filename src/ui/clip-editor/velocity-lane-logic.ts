import { type Note, MIN_VELOCITY } from '@core'
import { LANE_HEIGHT } from './piano-roll-geometry'
const PADDING = 6
/** A bar can be grabbed this many pixels either side of where its note starts. */
const HIT_RADIUS = 6

export { LANE_HEIGHT }

/** Velocity (0..1) for a vertical position in a lane `height` px high: top is loudest. */
export const velocityAtY = (y: number, height: number = LANE_HEIGHT): number => {
  const usable = height - 2 * PADDING
  return Math.min(1, Math.max(MIN_VELOCITY, 1 - (y - PADDING) / usable))
}

/** Where the top of a velocity bar sits in a lane `height` px high. */
export const barTop = (velocity: number, height: number = LANE_HEIGHT): number => PADDING + (1 - velocity) * (height - 2 * PADDING)

/** The same as CSS, for a lane whose height only CSS knows: `top` as a share of the lane less its padding. */
export const barTopCss = (velocity: number): string => `calc(${PADDING}px + ${1 - velocity} * (100% - ${2 * PADDING}px))`

/**
 * The note whose bar the pointer is on. Chords put several bars at one x, so among the bars in
 * reach the one whose top is closest to the pointer wins: pressing at a bar's height grabs that bar.
 */
export const pickNoteAt = (
  notes: readonly Note[],
  x: number,
  y: number,
  pixelsPerBeat: number,
  height: number = LANE_HEIGHT,
): Note | undefined => {
  let best: Note | undefined
  let bestDistance = Infinity
  for (const note of notes) {
    if (Math.abs(note.start * pixelsPerBeat - x) > HIT_RADIUS) continue
    const distance = Math.abs(barTop(note.velocity, height) - y)
    if (distance < bestDistance) {
      best = note
      bestDistance = distance
    }
  }
  return best
}
