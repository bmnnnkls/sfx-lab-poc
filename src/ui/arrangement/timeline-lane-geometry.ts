import type { AutomationPoint } from '@core'
import type { Axis } from '../shared/timeline'

/** A timeline automation lane's height, and the room kept above and below the curve so a point at 0 or 1 shows whole. */
export const LANE_HEIGHT = 40
const PAD = 4
/** How near the pointer has to be to a point to take it. */
export const POINT_HIT_PX = 6

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** The y of a value in a lane `height` pixels high. */
export const yOfValue = (value: number, height = LANE_HEIGHT): number => PAD + (1 - value) * (height - 2 * PAD)

/** The value at a y in a lane `height` pixels high. */
export const valueAtY = (y: number, height = LANE_HEIGHT): number => clamp(1 - (y - PAD) / (height - 2 * PAD), 0, 1)

/** The x of a beat on the visible timeline. */
export const xOfBeat = (axis: Axis, beat: number): number => (beat - axis.start) / axis.perPixel

/** The beat at an x on the visible timeline. */
export const beatAtX = (axis: Axis, x: number): number => Math.max(0, axis.start + x * axis.perPixel)

/** The point under the pointer: the nearest within `POINT_HIT_PX`, or null. */
export const pointAt = (points: readonly AutomationPoint[], axis: Axis, x: number, y: number, height = LANE_HEIGHT): string | null => {
  let best: string | null = null
  let nearest = POINT_HIT_PX * POINT_HIT_PX
  for (const point of points) {
    const dx = xOfBeat(axis, point.beat) - x, dy = yOfValue(point.value, height) - y
    const distance = dx * dx + dy * dy
    if (distance <= nearest) { nearest = distance; best = point.id }
  }
  return best
}

/**
 * The curve as a polyline over the visible timeline: flat at the first value before the first point and at the last
 * after the last, a step at each hold (and everywhere for a stepped control), a ramp at each linear segment. Only what
 * reaches into view, plus one segment either side. Empty with no points.
 */
export const curvePolyline = (points: readonly AutomationPoint[], axis: Axis, stepped: boolean, height = LANE_HEIGHT): readonly (readonly [number, number])[] => {
  if (!points.length) return []
  const end = axis.width
  const line: [number, number][] = []
  const first = points[0]!
  if (xOfBeat(axis, first.beat) > 0) line.push([0, yOfValue(first.value, height)])
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!, next = points[i + 1]
    // Wholly before the view: the segment to the next point starts before it too.
    if (next && xOfBeat(axis, next.beat) < 0) continue
    const x = xOfBeat(axis, point.beat), before = points[i - 1]
    if (before && line.length && (stepped || before.interpolation === 'hold')) line.push([x, yOfValue(before.value, height)])
    line.push([x, yOfValue(point.value, height)])
    if (x > end) return line
  }
  line.push([end, yOfValue(points.at(-1)!.value, height)])
  return line
}
