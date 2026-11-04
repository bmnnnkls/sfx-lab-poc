import type { WaveView } from '@core'
import type { WaveEditorView, WaveSelection, WaveZoom } from '@state'
import { type Axis, autoScrollUnits, clampAxis, fitPerPixel, xOf as axisXOf, zoomAxisAround, zoomAxisTo } from '../shared/timeline'

export { WHEEL_ZOOM } from '../shared/timeline'

/** The closest zoom: 32 px per frame. */
export const MIN_FRAMES_PER_PIXEL = 1 / 32

/** The view as the shared timeline geometry's axis, in frames, and back. */
const axisOf = (view: WaveView): Axis => ({ start: view.startFrame, perPixel: view.framesPerPixel, width: view.width })
const viewOf = (axis: Axis): WaveView => ({ startFrame: axis.start, framesPerPixel: axis.perPixel, width: axis.width })

/** The zoom that shows the whole sample in `width` columns (never closer than the closest zoom). */
export const fitFramesPerPixel = (frames: number, width: number): number => fitPerPixel(frames, width, MIN_FRAMES_PER_PIXEL)

/** The view inside the sample: zoom between the closest and the whole sample, scrolled no further than its ends. */
export const clampView = (view: WaveView, frames: number): WaveView => viewOf(clampAxis(axisOf(view), frames, MIN_FRAMES_PER_PIXEL))

/** What the stored view shows in `width` columns of a sample of `frames` frames (a fitted view fits). */
export const resolveView = (view: WaveEditorView, frames: number, width: number): WaveView =>
  clampView({ startFrame: view.startFrame, framesPerPixel: view.framesPerPixel ?? fitFramesPerPixel(frames, width), width }, frames)

/** Zooms by `factor` (above 1 out, below 1 in), keeping the frame under column `x` where it is. */
export const zoomAround = (view: WaveView, factor: number, x: number, frames: number): WaveView =>
  viewOf(zoomAxisAround(axisOf(view), factor, x, frames, MIN_FRAMES_PER_PIXEL))

/** The view that shows frames `from` to `to` across the width. */
export const zoomTo = (from: number, to: number, width: number, frames: number): WaveView =>
  viewOf(zoomAxisTo(from, from + Math.max(1, to - from), width, frames, MIN_FRAMES_PER_PIXEL))

/** Where a zoom asked for (`useWaveEditorStore.zoom`) leaves the stored view: fitted, or showing the range. */
export const resolveZoom = (zoom: WaveZoom, width: number, frames: number, stored: WaveEditorView): Pick<WaveEditorView, 'framesPerPixel' | 'startFrame'> => {
  if (zoom === 'fit') return { framesPerPixel: null, startFrame: 0 }
  if ('show' in zoom) return showFrame(stored, zoom.show, width, frames)
  const next = zoomTo(zoom.from, zoom.to, width, frames)
  return { framesPerPixel: next.framesPerPixel, startFrame: next.startFrame }
}

/** The stored view, scrolled by the least that shows `frame`; a view that shows it already, or fits, is kept. */
export const showFrame = (stored: WaveEditorView, frame: number, width: number, frames: number): Pick<WaveEditorView, 'framesPerPixel' | 'startFrame'> => {
  const view = resolveView(stored, frames, width)
  const x = xOf(view, frame)
  if (stored.framesPerPixel === null || (x >= 0 && x <= view.width)) return { framesPerPixel: stored.framesPerPixel, startFrame: stored.startFrame }
  const startFrame = x < 0 ? frame : frame - view.width * view.framesPerPixel
  return { framesPerPixel: view.framesPerPixel, startFrame: resolveView({ ...stored, startFrame }, frames, width).startFrame }
}

/** The frame under column `x` (fractional columns are fine), inside the sample. */
export const frameAt = (view: WaveView, x: number, frames: number): number =>
  Math.max(0, Math.min(frames, Math.round(view.startFrame + x * view.framesPerPixel)))

/** Where a frame is, in columns from the left edge. */
export const xOf = (view: WaveView, frame: number): number => axisXOf(axisOf(view), frame)

/** Whether a selection covers channel `channel` (0 left or mono, 1 right). */
export const coversChannel = (selection: WaveSelection, channel: number): boolean =>
  selection.channels === 'both' || selection.channels === (channel === 0 ? 'left' : 'right')

/**
 * What a right-click does before the menu opens, so the menu acts on what was clicked: inside the selection, on a
 * channel it covers, it keeps it; anywhere else it clears it and puts the cursor at the frame, as a click would. In the
 * spectrogram (`hz`, the frequency clicked) a box keeps only inside its band too; in the waveform its time range is.
 */
export const menuTargetAt = (selection: WaveSelection | null, frame: number, channel: number, hz: number | null = null): 'keep' | { readonly cursor: number } => {
  const inTime = selection && frame >= selection.from && frame <= selection.to && coversChannel(selection, channel)
  const inBand = !selection?.band || hz === null || (hz >= selection.band.low && hz <= selection.band.high)
  return inTime && inBand ? 'keep' : { cursor: frame }
}

/** A press this close to a selection's edge (in pixels) drags that edge. */
export const EDGE_PX = 4

/**
 * The selection's edge under column `x` on lane `channel`, within `EDGE_PX`, on a channel the selection covers; the
 * nearer one when both are that close (a narrow selection), `from` on a tie left of the middle.
 */
export const selectionEdgeAt = (view: WaveView, selection: WaveSelection | null, x: number, channel: number): 'from' | 'to' | null => {
  if (!selection || !coversChannel(selection, channel)) return null
  const from = Math.abs(x - xOf(view, selection.from))
  const to = Math.abs(x - xOf(view, selection.to))
  if (Math.min(from, to) > EDGE_PX) return null
  if (from !== to) return from < to ? 'from' : 'to'
  return x <= (xOf(view, selection.from) + xOf(view, selection.to)) / 2 ? 'from' : 'to'
}

/** Which of a box's edges a press drags: a time edge, a band edge, or both at a corner. */
export interface BoxEdge {
  readonly time: 'from' | 'to' | null
  readonly band: 'low' | 'high' | null
}

/**
 * The edge or corner of a selection's box under the point `x`, `y` (in a spectrogram part, `rowOf` giving a
 * frequency's row there) on lane `channel`, within `EDGE_PX` of it and of the box; null off it or without a band.
 */
export const boxEdgeAt = (view: WaveView, selection: WaveSelection | null, x: number, y: number, channel: number, rowOf: (hz: number) => number): BoxEdge | null => {
  if (!selection?.band || !coversChannel(selection, channel)) return null
  const left = xOf(view, selection.from)
  const right = xOf(view, selection.to)
  const top = rowOf(selection.band.high)
  const bottom = rowOf(selection.band.low)
  if (x < left - EDGE_PX || x > right + EDGE_PX || y < top - EDGE_PX || y > bottom + EDGE_PX) return null
  const nearer = <T>(a: number, b: number, first: T, second: T, middle: number, at: number): T | null => {
    const [toA, toB] = [Math.abs(at - a), Math.abs(at - b)]
    if (Math.min(toA, toB) > EDGE_PX) return null
    if (toA !== toB) return toA < toB ? first : second
    return at <= middle ? first : second
  }
  const time = nearer(left, right, 'from' as const, 'to' as const, (left + right) / 2, x)
  const band = nearer(top, bottom, 'high' as const, 'low' as const, (top + bottom) / 2, y)
  return time || band ? { time, band } : null
}

/** The pointer over a box's edge: left and right resize in time, top and bottom in frequency, a corner both. */
export const boxEdgeCursor = ({ time, band }: BoxEdge): string =>
  !band ? 'ew-resize' : !time ? 'ns-resize' : (time === 'from') === (band === 'high') ? 'nwse-resize' : 'nesw-resize'

/**
 * How far the view scrolls in one animation frame while a selection is dragged `distancePx` past the detail's edge
 * (negative: past the left one): a tenth of the distance in columns, at most a quarter of the view; none inside.
 */
export const autoScrollFrames = (distancePx: number, framesPerPixel: number, width: number): number =>
  autoScrollUnits(distancePx, framesPerPixel, width)
