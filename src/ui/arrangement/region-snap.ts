import { type Project, arrangementEnd } from '@core'
import { type Axis, type SnapTarget, type Snapping, snapTo } from '../shared/timeline'

/**
 * What a drag on the timeline snaps to: every region's start and end on any lane (`<id>:start`, `<id>:end`), every
 * marker (`marker:<id>`) and the loop's edges (`loop:from`, `loop:to`), less what the drag moves: `moving` is a region's
 * id, `marker:<id>` or `loop`, and leaves out the targets named so or under it.
 */
export const timelineSnapping = (project: Project, moving: string): Snapping => {
  const targets: SnapTarget[] = []
  for (const region of project.arrangement ?? []) {
    targets.push({ at: region.startBeat, key: `${region.id}:start` }, { at: arrangementEnd(region), key: `${region.id}:end` })
  }
  for (const marker of project.arrangementMarkers ?? []) targets.push({ at: marker.beat, key: `marker:${marker.id}` })
  const loop = project.arrangementLoop
  if (loop) targets.push({ at: loop.from, key: 'loop:from' }, { at: loop.to, key: 'loop:to' })
  return { targets: targets.filter((target) => target.key !== moving && !target.key.startsWith(`${moving}:`)) }
}

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
 * Where a moved region (or the loop brace) of `length` beats starts, asked at `start`: its start snapped, or, when its end is nearer a
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
