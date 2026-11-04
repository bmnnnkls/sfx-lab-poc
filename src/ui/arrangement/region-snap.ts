import { type ArrangementClip, arrangementEnd } from '@core'
import { type Axis, type Snapping, snapTo } from '../shared/timeline'

/** Every other region's start and end, on any lane: what a moved or resized region's edges snap to. */
export const regionSnapping = (regions: readonly ArrangementClip[], moving: string): Snapping => ({
  targets: regions.flatMap((region) =>
    region.id === moving ? [] : [{ at: region.startBeat, key: `${region.id}:start` }, { at: arrangementEnd(region), key: `${region.id}:end` }],
  ),
})

/**
 * A beat snapped: to the nearer of the grid's line (with the grid on) and a target within reach (`snapTo`); left as it
 * is with neither, or with Alt held (`grid` and `snapping` both null). Never before 0.
 */
export const snapBeat = (beat: number, gridBeats: number | null, snapping: Snapping | null, axis: Axis): number => {
  const onGrid = gridBeats === null ? null : Math.round(beat / gridBeats) * gridBeats
  const toTarget = snapping ? snapTo(beat, snapping, axis) : beat
  const pulled = toTarget !== beat
  const best = pulled && (onGrid === null || Math.abs(toTarget - beat) <= Math.abs(onGrid - beat)) ? toTarget : (onGrid ?? beat)
  return Math.max(0, best)
}

/**
 * Where a moved region of `length` beats starts, asked at `start`: its start snapped, or, when its end is nearer a
 * line or target than its start is, its end (so a region can be dragged to end at a bar).
 */
export const snapRegionStart = (start: number, length: number, snap: (beat: number) => number): number => {
  const byStart = snap(start)
  const end = snap(start + length)
  // An end that snapped to nothing is no candidate: left where it is, it would always be the nearer.
  if (end === start + length) return Math.max(0, byStart)
  const byEnd = end - length
  return Math.max(0, byStart === start || Math.abs(byEnd - start) < Math.abs(byStart - start) ? byEnd : byStart)
}
