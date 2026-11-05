import { MAX_AUTOMATION_POINTS, type AutomationPoint } from '@core'

/**
 * The automation editors' pointer logic as pure functions of the pointer and the points at the press, as
 * `note-gestures.ts` is for the piano roll. The clip editor and the timeline's lanes both call them: one in a clip's
 * beats, the other in song beats.
 */

/** Where the pointer is: a beat (not snapped) and a normalized value. */
export interface PointerAt {
  readonly beat: number
  readonly value: number
}

/** Modifier keys held. */
export interface PointerKeys {
  readonly shift?: boolean
  /** ⌘ on a Mac, Ctrl elsewhere. */
  readonly command?: boolean
  readonly alt?: boolean
}

/** What snaps a beat: a grid step (0 for none), and the beats a point may take. */
export interface PointGrid {
  readonly step: number
  readonly length: number
  /** A snap of the caller's own (the timeline's grid and marks); it wins over `step`. */
  readonly snap?: (beat: number) => number
}

export type PointGesture =
  /** Moves the selection from where it was at the press. */
  | { readonly kind: 'move'; readonly origin: readonly AutomationPoint[]; readonly selected: ReadonlySet<string>; readonly from: PointerAt }
  /** A box from the press to the pointer selects what is inside it, among the points at the press. */
  | { readonly kind: 'box'; readonly origin: readonly AutomationPoint[]; readonly from: PointerAt; readonly base: ReadonlySet<string> }

export interface PressResult {
  readonly points: readonly AutomationPoint[]
  readonly selected: ReadonlySet<string>
  /** What a drag after the press does; none for a Shift-click or a refused point. */
  readonly gesture: PointGesture | null
  /** Whether `points` changed (a point was added). */
  readonly changed: boolean
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** A beat on the grid, inside the length; Alt held, as it is. */
export const snapPointBeat = (beat: number, grid: PointGrid, keys: PointerKeys = {}): number => {
  if (keys.alt) return clamp(beat, 0, grid.length)
  const snapped = grid.snap ? grid.snap(beat) : grid.step ? Math.round(beat / grid.step) * grid.step : beat
  return clamp(snapped, 0, grid.length)
}

/**
 * A press: on a point, Shift toggles it in the selection and does nothing more, else it drags the selection (the point
 * alone if it wasn't selected); on empty space, ⌘ or Ctrl starts a box (Shift adds to the selection), else a point is
 * added there and drags. A point past the limit is refused.
 */
export const pressPoints = (
  points: readonly AutomationPoint[],
  hit: string | null,
  at: PointerAt,
  keys: PointerKeys,
  selected: ReadonlySet<string>,
  grid: PointGrid,
  newId: () => string,
): PressResult => {
  const existing = hit === null ? undefined : points.find((point) => point.id === hit)
  if (existing) {
    if (keys.shift) {
      const next = new Set(selected)
      if (next.has(existing.id)) next.delete(existing.id)
      else next.add(existing.id)
      return { points, selected: next, gesture: null, changed: false }
    }
    const ids = selected.has(existing.id) ? selected : new Set([existing.id])
    return { points, selected: ids, gesture: { kind: 'move', origin: points, selected: ids, from: at }, changed: false }
  }
  if (keys.command) {
    const base = keys.shift ? selected : new Set<string>()
    return { points, selected: base, gesture: { kind: 'box', origin: points, from: at, base }, changed: false }
  }
  if (points.length >= MAX_AUTOMATION_POINTS) return { points, selected, gesture: null, changed: false }
  const point: AutomationPoint = { id: newId(), beat: snapPointBeat(at.beat, grid, keys), value: clamp(at.value, 0, 1), interpolation: 'linear' }
  const next = [...points, point]
  const ids = new Set([point.id])
  return { points: next, selected: ids, gesture: { kind: 'move', origin: next, selected: ids, from: { beat: point.beat, value: point.value } }, changed: true }
}

/**
 * A drag: a move shifts the selected points by the snapped distance (Shift keeps their beats, Alt doesn't snap), kept
 * inside the length and the value range as a group; a box selects the points inside it.
 */
export const dragPoints = (gesture: PointGesture, at: PointerAt, keys: PointerKeys, grid: PointGrid): { points: readonly AutomationPoint[] | null; selected: ReadonlySet<string> } => {
  if (gesture.kind === 'box') {
    const inside = pointsInBox(gesture.from, at)
    return { points: null, selected: new Set([...gesture.base, ...gesture.origin.filter(inside).map((point) => point.id)]) }
  }
  const chosen = gesture.origin.filter((point) => gesture.selected.has(point.id))
  if (!chosen.length) return { points: gesture.origin, selected: gesture.selected }
  const first = Math.min(...chosen.map((point) => point.beat)), last = Math.max(...chosen.map((point) => point.beat))
  const wanted = keys.shift ? 0 : snapPointBeat(at.beat, grid, keys) - snapPointBeat(gesture.from.beat, grid, keys)
  const delta = clamp(wanted, -first, grid.length - last)
  const lift = at.value - gesture.from.value
  const points = gesture.origin.map((point) => gesture.selected.has(point.id) ? { ...point, beat: point.beat + delta, value: clamp(point.value + lift, 0, 1) } : point)
  return { points, selected: gesture.selected }
}

/** Whether a point lies inside the box between two corners. */
const pointsInBox = (a: PointerAt, b: PointerAt) => {
  const [beat0, beat1] = [Math.min(a.beat, b.beat), Math.max(a.beat, b.beat)]
  const [value0, value1] = [Math.min(a.value, b.value), Math.max(a.value, b.value)]
  return (point: AutomationPoint) => point.beat >= beat0 && point.beat <= beat1 && point.value >= value0 && point.value <= value1
}

/** Copied points, beats from the first: what the clipboard keeps. */
export const copyPoints = (points: readonly AutomationPoint[], selected: ReadonlySet<string>): readonly AutomationPoint[] => {
  const chosen = points.filter((point) => selected.has(point.id))
  if (!chosen.length) return []
  const start = Math.min(...chosen.map((point) => point.beat))
  return chosen.map((point) => ({ ...point, beat: point.beat - start }))
}

/** Copied points pasted at `beat` with fresh ids; what lands past the length is left out. */
export const pastePoints = (points: readonly AutomationPoint[], copied: readonly AutomationPoint[], beat: number, length: number, newId: () => string): { points: readonly AutomationPoint[]; pasted: ReadonlySet<string> } => {
  const pasted = copied.map((point) => ({ ...point, id: newId(), beat: point.beat + beat })).filter((point) => point.beat <= length)
  return { points: [...points, ...pasted].slice(0, MAX_AUTOMATION_POINTS), pasted: new Set(pasted.map((point) => point.id)) }
}

/** The points without the selected ones. */
export const removePoints = (points: readonly AutomationPoint[], selected: ReadonlySet<string>): readonly AutomationPoint[] => points.filter((point) => !selected.has(point.id))

/** The point whose segment holds `beat` (the last at or before it), or none before the first. */
export const segmentAt = (points: readonly AutomationPoint[], beat: number): AutomationPoint | undefined => {
  let found: AutomationPoint | undefined
  for (const point of [...points].sort((a, b) => a.beat - b.beat)) if (point.beat <= beat + 1e-9) found = point
  return found
}

/** The segment at `beat` switched to linear or hold. */
export const setSegmentInterpolation = (points: readonly AutomationPoint[], beat: number, interpolation: AutomationPoint['interpolation']): readonly AutomationPoint[] => {
  const start = segmentAt(points, beat)
  return !start || start.interpolation === interpolation ? points : points.map((point) => (point === start ? { ...point, interpolation } : point))
}
