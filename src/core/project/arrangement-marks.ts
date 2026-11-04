import { createId } from '../shared'
import { timelineEnd } from './arrangement-clip'
import { MAX_NAME_LENGTH } from './edit'
import { MAX_TIMELINE_BEATS } from './limits'
import type { Project } from './types'

/** A named place on the arrangement's timeline, in beats from the song's start. */
export interface ArrangementMarker {
  readonly id: string
  readonly beat: number
  readonly name: string
}

/**
 * The loop brace: the range arrangement playback repeats while `enabled`. The range is a project edit and undone;
 * `enabled` is a view field (saved, not undone, carried by `withViewOf`), as a group's `collapsed` is.
 */
export interface ArrangementLoop {
  readonly from: number
  readonly to: number
  /** Playback loops the range. Absent = off: the brace stays drawn, dimmed. */
  readonly enabled?: boolean
}

/** At most this many markers on the timeline. */
export const MAX_ARRANGEMENT_MARKERS = 256
/** The shortest loop, in beats. */
export const MIN_LOOP_BEATS = 1

/**
 * Editing the arrangement's markers and loop: pure functions on a `Project`, each returning the same project when
 * nothing changes. Beats are inside `[0, MAX_TIMELINE_BEATS]`, markers are kept in beat order, names are trimmed and
 * cut to `MAX_NAME_LENGTH`, and the loop keeps at least `MIN_LOOP_BEATS`.
 */

const beatOf = (beat: number) => Math.max(0, Math.min(MAX_TIMELINE_BEATS, Number.isFinite(beat) ? beat : 0))
const nameOf = (name: string) => name.trim().slice(0, MAX_NAME_LENGTH)
const byBeat = (a: ArrangementMarker, b: ArrangementMarker) => a.beat - b.beat

/** The project with `markers` in beat order; without the field when there are none. */
const withMarkers = (project: Project, markers: readonly ArrangementMarker[]): Project => {
  if (markers.length === 0) {
    const { arrangementMarkers: _none, ...rest } = project
    return rest
  }
  return { ...project, arrangementMarkers: [...markers].sort(byBeat) }
}

/** "Marker N" with the lowest N no marker is named. */
const defaultName = (markers: readonly ArrangementMarker[]) => {
  const taken = new Set(markers.map((marker) => marker.name))
  let n = 1
  while (taken.has(`Marker ${n}`)) n++
  return `Marker ${n}`
}

/** A new marker's id, for a caller that needs to know it (to rename or select what it added). */
export const createMarkerId = (): string => createId('marker')

/** Adds a marker at `beat`, named `name` or the next free *Marker N*; at the limit, nothing. */
export const addArrangementMarker = (project: Project, beat: number, name?: string, id = createMarkerId()): Project => {
  const markers = project.arrangementMarkers ?? []
  if (markers.length >= MAX_ARRANGEMENT_MARKERS) return project
  const named = name === undefined ? '' : nameOf(name)
  return withMarkers(project, [...markers, { id, beat: beatOf(beat), name: named || defaultName(markers) }])
}

const changeMarker = (project: Project, id: string, change: (marker: ArrangementMarker) => ArrangementMarker): Project => {
  const markers = project.arrangementMarkers ?? []
  const marker = markers.find((candidate) => candidate.id === id)
  if (!marker) return project
  const next = change(marker)
  if (next.beat === marker.beat && next.name === marker.name) return project
  return withMarkers(project, markers.map((candidate) => (candidate.id === id ? next : candidate)))
}

export const moveArrangementMarker = (project: Project, id: string, beat: number): Project =>
  changeMarker(project, id, (marker) => ({ ...marker, beat: beatOf(beat) }))

/** Renames a marker; an empty name changes nothing. */
export const renameArrangementMarker = (project: Project, id: string, name: string): Project =>
  changeMarker(project, id, (marker) => ({ ...marker, name: nameOf(name) || marker.name }))

export const removeArrangementMarker = (project: Project, id: string): Project => {
  const markers = project.arrangementMarkers ?? []
  return markers.some((marker) => marker.id === id) ? withMarkers(project, markers.filter((marker) => marker.id !== id)) : project
}

/** `from` up to `to`, in order, inside the timeline, stretched to `MIN_LOOP_BEATS` when shorter. */
export const loopRangeOf = (range: { readonly from: number; readonly to: number }): { from: number; to: number } => {
  let from = beatOf(Math.min(range.from, range.to))
  let to = beatOf(Math.max(range.from, range.to))
  if (to - from < MIN_LOOP_BEATS) {
    if (from + MIN_LOOP_BEATS <= MAX_TIMELINE_BEATS) to = from + MIN_LOOP_BEATS
    else from = to - MIN_LOOP_BEATS
  }
  return { from, to }
}

/** Sets the loop's range, keeping whether it is on. A new loop is off. */
export const setArrangementLoop = (project: Project, range: { readonly from: number; readonly to: number }): Project => {
  const { from, to } = loopRangeOf(range)
  const loop = project.arrangementLoop
  if (loop && loop.from === from && loop.to === to) return project
  return { ...project, arrangementLoop: { from, to, ...(loop?.enabled === true && { enabled: true }) } }
}

export const removeArrangementLoop = (project: Project): Project => {
  if (!project.arrangementLoop) return project
  const { arrangementLoop: _removed, ...rest } = project
  return rest
}

/** Turns looping on or off; without a loop, nothing. A view edit. */
export const setArrangementLoopEnabled = (project: Project, enabled: boolean): Project => {
  const loop = project.arrangementLoop
  if (!loop || (loop.enabled === true) === enabled) return project
  const { enabled: _was, ...range } = loop
  return { ...project, arrangementLoop: enabled ? { ...range, enabled: true } : range }
}

/** The loop's range when playback repeats it, else null: what the engine's transport loops. */
export const activeArrangementLoop = (project: Project): { from: number; to: number } | null => {
  const loop = project.arrangementLoop
  return loop?.enabled === true ? { from: loop.from, to: loop.to } : null
}

/** `restored` with `current`'s loop toggle, when both have a loop (see `withViewOf`). */
export const withLoopEnabledOf = (restored: Project, current: Project): Project => {
  if (!restored.arrangementLoop || !current.arrangementLoop) return restored
  return setArrangementLoopEnabled(restored, current.arrangementLoop.enabled === true)
}

/**
 * Where the timeline's content ends, in beats: the last beat a region sounds, the loop's end or the last marker,
 * whichever is last; 0 with none. The view draws a few bars past it, and *Zoom to fit* and End go up to it.
 */
export const arrangementContentEnd = (project: Project): number => {
  const markers = project.arrangementMarkers ?? []
  return Math.max(timelineEnd(project.arrangement ?? []), project.arrangementLoop?.to ?? 0, markers.at(-1)?.beat ?? 0)
}

/** The beats `[` and `]` step through: every marker and the loop's edges, in order, each once. */
export const arrangementStops = (project: Project): readonly number[] => {
  const beats = (project.arrangementMarkers ?? []).map((marker) => marker.beat)
  if (project.arrangementLoop) beats.push(project.arrangementLoop.from, project.arrangementLoop.to)
  return [...new Set(beats)].sort((a, b) => a - b)
}

/** The marker after `id` in beat order, or null at the last. */
export const nextArrangementMarker = (project: Project, id: string): ArrangementMarker | null => {
  const markers = project.arrangementMarkers ?? []
  const index = markers.findIndex((marker) => marker.id === id)
  return index < 0 ? null : (markers[index + 1] ?? null)
}
