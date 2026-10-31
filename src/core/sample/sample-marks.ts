import { createId } from '../shared'
import { SAMPLE_MARK_LIMITS, savedFrameCount } from './marks'
import type { FrameRange } from './remap'
import type { SampleInfo, SampleMarker, SampleRegion } from './types'

/**
 * Editing a sample's markers, regions and loop: pure functions on a `SampleInfo`, each returning the same object when
 * nothing changes. Frames are whole and inside the sample's saved length; a region and the loop keep at least one
 * frame; names are cut to `SAMPLE_MARK_LIMITS.name`. Markers are kept in frame order and regions in `from` order, so
 * drawing and stepping from mark to mark walk them in order.
 */

/** A new marker's or region's id, for a caller that needs to know it (to rename what *Add marker* added). */
export const createMarkId = (kind: 'marker' | 'region'): string => createId(kind)

/** One change to a sample's marks, as the project store takes it. */
export type SampleMarkChange = (info: SampleInfo) => SampleInfo

const frameOf = (info: SampleInfo, frame: number) => Math.max(0, Math.min(savedFrameCount(info), Math.round(frame)))

/** `from` up to `to` inside the sample, whole frames, in order, at least one frame; null when the sample has none. */
const rangeOf = (info: SampleInfo, range: FrameRange): FrameRange | null => {
  const frames = savedFrameCount(info)
  if (frames < 1) return null
  let from = frameOf(info, Math.min(range.from, range.to))
  let to = frameOf(info, Math.max(range.from, range.to))
  if (to - from < 1) {
    if (to < frames) to = from + 1
    else from = to - 1
  }
  return { from, to }
}

const nameOf = (name: string) => name.trim().slice(0, SAMPLE_MARK_LIMITS.name)

/** "Marker N" with the lowest N no mark in `marks` is named. */
const defaultName = (prefix: string, marks: readonly { readonly name: string }[]) => {
  const taken = new Set(marks.map((mark) => mark.name))
  let n = 1
  while (taken.has(`${prefix} ${n}`)) n++
  return `${prefix} ${n}`
}

const byFrame = (a: SampleMarker, b: SampleMarker) => a.frame - b.frame
const byStart = (a: SampleRegion, b: SampleRegion) => a.from - b.from || a.to - b.to

const withMarkers = (info: SampleInfo, markers: readonly SampleMarker[]): SampleInfo => ({ ...info, markers: [...markers].sort(byFrame) })
const withRegions = (info: SampleInfo, regions: readonly SampleRegion[]): SampleInfo => ({ ...info, regions: [...regions].sort(byStart) })

/** Adds a marker at `frame`, named `name` or the next free *Marker N*; at the limit, nothing. */
export const addMarker = (info: SampleInfo, frame: number, name?: string, id = createMarkId('marker')): SampleInfo => {
  const markers = info.markers ?? []
  if (markers.length >= SAMPLE_MARK_LIMITS.markers || savedFrameCount(info) < 1) return info
  const named = name === undefined ? '' : nameOf(name)
  return withMarkers(info, [...markers, { id, frame: frameOf(info, frame), name: named || defaultName('Marker', markers) }])
}

const changeMarker = (info: SampleInfo, id: string, change: (marker: SampleMarker) => SampleMarker): SampleInfo => {
  const markers = info.markers ?? []
  const marker = markers.find((candidate) => candidate.id === id)
  if (!marker) return info
  const next = change(marker)
  if (next.frame === marker.frame && next.name === marker.name) return info
  return withMarkers(info, markers.map((candidate) => (candidate.id === id ? next : candidate)))
}

export const moveMarker = (info: SampleInfo, id: string, frame: number): SampleInfo =>
  changeMarker(info, id, (marker) => ({ ...marker, frame: frameOf(info, frame) }))

/** Renames a marker; an empty name changes nothing. */
export const renameMarker = (info: SampleInfo, id: string, name: string): SampleInfo =>
  changeMarker(info, id, (marker) => ({ ...marker, name: nameOf(name) || marker.name }))

export const removeMarker = (info: SampleInfo, id: string): SampleInfo => {
  const markers = info.markers ?? []
  return markers.some((marker) => marker.id === id) ? { ...info, markers: markers.filter((marker) => marker.id !== id) } : info
}

/** Adds a region over `range`, named `name` or the next free *Region N*; at the limit, nothing. */
export const addRegion = (info: SampleInfo, range: FrameRange, name?: string, id = createMarkId('region')): SampleInfo => {
  const regions = info.regions ?? []
  const kept = rangeOf(info, range)
  if (regions.length >= SAMPLE_MARK_LIMITS.regions || !kept) return info
  const named = name === undefined ? '' : nameOf(name)
  return withRegions(info, [...regions, { id, ...kept, name: named || defaultName('Region', regions) }])
}

/**
 * Moves a region's edges or renames it. An edge moved alone stops a frame short of the other; an empty name changes
 * nothing.
 */
export const updateRegion = (info: SampleInfo, id: string, change: { readonly from?: number; readonly to?: number; readonly name?: string }): SampleInfo => {
  const regions = info.regions ?? []
  const region = regions.find((candidate) => candidate.id === id)
  if (!region) return info
  const next = { ...region, ...edgesOf(info, region, change), name: change.name === undefined ? region.name : nameOf(change.name) || region.name }
  if (next.from === region.from && next.to === region.to && next.name === region.name) return info
  return withRegions(info, regions.map((candidate) => (candidate.id === id ? next : candidate)))
}

/** A range's edges after moving one or both: one alone stops a frame short of the other. */
const edgesOf = (info: SampleInfo, range: FrameRange, change: { readonly from?: number; readonly to?: number }): FrameRange => {
  if (change.from !== undefined && change.to !== undefined) return rangeOf(info, { from: change.from, to: change.to }) ?? range
  if (change.from !== undefined) return { from: Math.min(frameOf(info, change.from), range.to - 1), to: range.to }
  if (change.to !== undefined) return { from: range.from, to: Math.max(frameOf(info, change.to), range.from + 1) }
  return range
}

export const removeRegion = (info: SampleInfo, id: string): SampleInfo => {
  const regions = info.regions ?? []
  return regions.some((region) => region.id === id) ? { ...info, regions: regions.filter((region) => region.id !== id) } : info
}

/** Sets the sample's loop to `range`, or clears it with null. */
export const setLoop = (info: SampleInfo, range: FrameRange | null): SampleInfo => {
  if (range === null) {
    if (!info.loop) return info
    const { loop: _loop, ...rest } = info
    return rest
  }
  const kept = rangeOf(info, range)
  if (!kept || (info.loop && info.loop.from === kept.from && info.loop.to === kept.to)) return info
  return { ...info, loop: kept }
}

/** Moves one or both of the loop's edges, as `updateRegion` moves a region's. Without a loop, nothing. */
export const moveLoop = (info: SampleInfo, change: { readonly from?: number; readonly to?: number }): SampleInfo => {
  if (!info.loop) return info
  const next = edgesOf(info, info.loop, change)
  return next.from === info.loop.from && next.to === info.loop.to ? info : { ...info, loop: next }
}
