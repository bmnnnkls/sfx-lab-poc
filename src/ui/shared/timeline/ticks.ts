import type { Axis } from './axis'

export interface RulerTick {
  /** Columns from the left edge. */
  readonly x: number
  readonly label: string
}

/** Labels at least this far apart. */
const MIN_SPACING_PX = 72

/** In beats: sixteenths up to bars of 4/4 and more. */
export const BEAT_STEPS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]

/** m:ss.mmm */
export const formatTime = (seconds: number): string => {
  const millis = Math.round(seconds * 1000)
  const minutes = Math.floor(millis / 60000)
  const rest = millis - minutes * 60000
  return `${minutes}:${String(Math.floor(rest / 1000)).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`
}

/** Bar, beat and (off the beat) sixteenth, counted from 1, in 4/4 from 0. */
export const formatBeat = (beats: number): string => {
  const sixteenths = Math.round(beats * 4)
  const bar = Math.floor(sixteenths / 16) + 1
  const beat = Math.floor((sixteenths % 16) / 4) + 1
  const sixteenth = (sixteenths % 4) + 1
  return sixteenth === 1 ? `${bar}.${beat}` : `${bar}.${beat}.${sixteenth}`
}

/** The step of `steps` (each in labels, a label being `perLabel` units) whose ticks are at least `MIN_SPACING_PX` apart; the last when none are. */
export const tickStep = (axis: Axis, perLabel: number, steps: readonly number[]): number => {
  const pxPerLabel = perLabel / axis.perPixel
  return steps.find((candidate) => candidate * pxPerLabel >= MIN_SPACING_PX) ?? steps[steps.length - 1]!
}

/** The ticks every step of `steps` (a label counting `perLabel` units) that fall inside the axis, labelled. */
export const ticks = (axis: Axis, perLabel: number, steps: readonly number[], label: (labels: number) => string): RulerTick[] => {
  const pxPerLabel = perLabel / axis.perPixel
  const step = tickStep(axis, perLabel, steps)
  const first = axis.start / perLabel
  const result: RulerTick[] = []
  for (let index = Math.max(0, Math.ceil(first / step - 1e-9)); ; index++) {
    const labels = index * step
    const x = (labels - first) * pxPerLabel
    if (x > axis.width) return result
    result.push({ x, label: label(labels) })
  }
}
