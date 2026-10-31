import type { SampleInfo, SampleLoop, SampleMarker, SampleRegion, WaveView } from '@core'
import { EDGE_PX, xOf } from './wave-geometry'

/** A sample's markers, regions and loop, as the mark lane draws them. */
export interface Marks {
  readonly markers: readonly SampleMarker[]
  readonly regions: readonly SampleRegion[]
  readonly loop: SampleLoop | null
}

const NONE: readonly never[] = []
export const marksOf = (sample: SampleInfo): Marks => ({ markers: sample.markers ?? NONE, regions: sample.regions ?? NONE, loop: sample.loop ?? null })

/** A press this close to a marker (in pixels) is on it. */
export const MARKER_PX = 4

/** What is under the pointer in the mark lane. */
export type MarkHit = { readonly kind: 'marker'; readonly id: string } | { readonly kind: 'region'; readonly id: string } | { readonly kind: 'loop' } | null

/** An edge of a region or the loop under the pointer, which a drag moves. */
export type MarkEdge = { readonly kind: 'region'; readonly id: string; readonly edge: 'from' | 'to' } | { readonly kind: 'loop'; readonly edge: 'from' | 'to' }

/**
 * What the mark lane's menu and a click act on at column `x`: the nearest marker within `MARKER_PX`, else the loop when
 * the pointer is on one of its edges, else the region or the loop under it (the shortest of those, so one inside
 * another can be reached), else nothing.
 */
export const markAt = (view: WaveView, marks: Marks, x: number): MarkHit => {
  const distance = (frame: number) => Math.abs(xOf(view, frame) - x)
  let marker: SampleMarker | null = null
  for (const candidate of marks.markers) if (distance(candidate.frame) <= MARKER_PX && (!marker || distance(candidate.frame) < distance(marker.frame))) marker = candidate
  if (marker) return { kind: 'marker', id: marker.id }
  const { loop } = marks
  if (loop && (distance(loop.from) <= EDGE_PX || distance(loop.to) <= EDGE_PX)) return { kind: 'loop' }
  const under = (range: { from: number; to: number }) => xOf(view, range.from) <= x && x <= xOf(view, range.to)
  const spans: Array<{ hit: MarkHit; length: number }> = marks.regions.filter(under).map((region) => ({ hit: { kind: 'region', id: region.id }, length: region.to - region.from }))
  if (loop && under(loop)) spans.push({ hit: { kind: 'loop' }, length: loop.to - loop.from })
  spans.sort((a, b) => a.length - b.length)
  return spans[0]?.hit ?? null
}

/** The region or loop edge nearest column `x`, within `EDGE_PX`; the loop's first when they meet. */
export const markEdgeAt = (view: WaveView, marks: Marks, x: number): MarkEdge | null => {
  let best: { edge: MarkEdge; distance: number } | null = null
  const consider = (edge: MarkEdge, frame: number) => {
    const distance = Math.abs(xOf(view, frame) - x)
    if (distance <= EDGE_PX && (!best || distance < best.distance)) best = { edge, distance }
  }
  if (marks.loop) {
    consider({ kind: 'loop', edge: 'from' }, marks.loop.from)
    consider({ kind: 'loop', edge: 'to' }, marks.loop.to)
  }
  for (const region of marks.regions) {
    consider({ kind: 'region', id: region.id, edge: 'from' }, region.from)
    consider({ kind: 'region', id: region.id, edge: 'to' }, region.to)
  }
  return (best as { edge: MarkEdge } | null)?.edge ?? null
}

/** Where each mark's lines through the lanes are, in columns: markers solid, region and loop edges faint. */
export const markLines = (view: WaveView, marks: Marks): { readonly markers: number[]; readonly edges: number[] } => {
  const inView = (x: number) => x >= -1 && x <= view.width + 1
  const markers = marks.markers.map((marker) => xOf(view, marker.frame)).filter(inView)
  const ranges = marks.loop ? [...marks.regions, marks.loop] : marks.regions
  const edges = ranges.flatMap((range) => [xOf(view, range.from), xOf(view, range.to)]).filter(inView)
  return { markers, edges }
}
