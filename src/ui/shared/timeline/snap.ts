import type { Axis } from './axis'

/** A pointer gesture snaps to a target this close, in columns. */
export const SNAP_PX = 8

/** One place a gesture may snap to, named so a drag can leave out what it moves. */
export interface SnapTarget {
  readonly at: number
  readonly key: string
}

/** What gestures snap to now: fixed targets, and optionally the nearest of something computed on demand. */
export interface Snapping {
  readonly targets: readonly SnapTarget[]
  /** The nearest computed target to `value` within `radius` units (a zero crossing), else null. */
  readonly nearest?: (value: number, radius: number) => number | null
}

/**
 * The nearest target within `SNAP_PX` columns of `value` (a computed one is one more candidate), else the value. No
 * snapping (null: snapping off, or Alt held) leaves it. `ignore` leaves out the target a drag is moving.
 */
export const snapTo = (value: number, snapping: Snapping | null, axis: Axis, ignore?: string): number => {
  if (!snapping) return value
  const radius = SNAP_PX * axis.perPixel
  let best = value
  let distance = Infinity
  const consider = (candidate: number) => {
    const away = Math.abs(candidate - value)
    if (away <= radius && away < distance) [best, distance] = [candidate, away]
  }
  for (const target of snapping.targets) if (target.key !== ignore) consider(target.at)
  const nearest = snapping.nearest?.(value, radius)
  if (nearest !== null && nearest !== undefined) consider(nearest)
  return best
}
