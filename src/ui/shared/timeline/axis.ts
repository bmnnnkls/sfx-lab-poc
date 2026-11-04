/**
 * What a timeline shows, in whatever unit its caller counts (frames in the Wave editor, beats in the arrangement): from
 * `start`, `perPixel` units per column, across `width` columns.
 */
export interface Axis {
  readonly start: number
  readonly perPixel: number
  readonly width: number
}

/** How much one wheel notch (100 px of delta) zooms. */
export const WHEEL_ZOOM = 1.25

/** The zoom that shows `length` units in `width` columns (never closer than `minPerPixel`). */
export const fitPerPixel = (length: number, width: number, minPerPixel: number): number => Math.max(minPerPixel, length / Math.max(1, width))

/** The axis inside `[0, length]`: zoom between `minPerPixel` and the whole length, scrolled no further than its ends. */
export const clampAxis = (axis: Axis, length: number, minPerPixel: number): Axis => {
  const perPixel = Math.min(fitPerPixel(length, axis.width, minPerPixel), Math.max(minPerPixel, axis.perPixel))
  const start = Math.max(0, Math.min(Math.max(0, length - axis.width * perPixel), axis.start))
  return { start, perPixel, width: axis.width }
}

/** Zooms by `factor` (above 1 out, below 1 in), keeping the unit under column `x` where it is. */
export const zoomAxisAround = (axis: Axis, factor: number, x: number, length: number, minPerPixel: number): Axis => {
  const anchor = axis.start + x * axis.perPixel
  const perPixel = axis.perPixel * factor
  return clampAxis({ start: anchor - x * perPixel, perPixel, width: axis.width }, length, minPerPixel)
}

/** The axis that shows `from` to `to` across `width` columns. */
export const zoomAxisTo = (from: number, to: number, width: number, length: number, minPerPixel: number): Axis =>
  clampAxis({ start: from, perPixel: (to - from) / Math.max(1, width), width }, length, minPerPixel)

/** Where a unit is, in columns from the left edge. */
export const xOf = (axis: Axis, at: number): number => (at - axis.start) / axis.perPixel

/** The unit under column `x` (fractional columns are fine), not rounded or clamped. */
export const unitAt = (axis: Axis, x: number): number => axis.start + x * axis.perPixel

/**
 * How far the view scrolls in one animation frame while something is dragged `distancePx` past the timeline's edge
 * (negative: past the left one): a tenth of the distance in columns, at most a quarter of the view; none inside.
 */
export const autoScrollUnits = (distancePx: number, perPixel: number, width: number): number =>
  Math.sign(distancePx) * Math.min(Math.abs(distancePx) / 10, width / 4) * perPixel
