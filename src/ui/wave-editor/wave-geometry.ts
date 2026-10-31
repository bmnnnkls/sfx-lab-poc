import type { WaveView } from '@core'
import type { WaveEditorView, WaveSelection, WaveZoom } from '@state'

/** How much one wheel notch (100 px of delta) zooms. */
export const WHEEL_ZOOM = 1.25

/** The closest zoom: 32 px per frame. */
export const MIN_FRAMES_PER_PIXEL = 1 / 32

/** The zoom that shows the whole sample in `width` columns (never closer than the closest zoom). */
export const fitFramesPerPixel = (frames: number, width: number): number => Math.max(MIN_FRAMES_PER_PIXEL, frames / Math.max(1, width))

/** The view inside the sample: zoom between the closest and the whole sample, scrolled no further than its ends. */
export const clampView = (view: WaveView, frames: number): WaveView => {
  const framesPerPixel = Math.min(fitFramesPerPixel(frames, view.width), Math.max(MIN_FRAMES_PER_PIXEL, view.framesPerPixel))
  const startFrame = Math.max(0, Math.min(Math.max(0, frames - view.width * framesPerPixel), view.startFrame))
  return { startFrame, framesPerPixel, width: view.width }
}

/** What the stored view shows in `width` columns of a sample of `frames` frames (a fitted view fits). */
export const resolveView = (view: WaveEditorView, frames: number, width: number): WaveView =>
  clampView({ startFrame: view.startFrame, framesPerPixel: view.framesPerPixel ?? fitFramesPerPixel(frames, width), width }, frames)

/** Zooms by `factor` (above 1 out, below 1 in), keeping the frame under column `x` where it is. */
export const zoomAround = (view: WaveView, factor: number, x: number, frames: number): WaveView => {
  const anchor = view.startFrame + x * view.framesPerPixel
  const framesPerPixel = view.framesPerPixel * factor
  return clampView({ startFrame: anchor - x * framesPerPixel, framesPerPixel, width: view.width }, frames)
}

/** The view that shows frames `from` to `to` across the width. */
export const zoomTo = (from: number, to: number, width: number, frames: number): WaveView =>
  clampView({ startFrame: from, framesPerPixel: Math.max(1, to - from) / Math.max(1, width), width }, frames)

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
export const xOf = (view: WaveView, frame: number): number => (frame - view.startFrame) / view.framesPerPixel

/** Whether a selection covers channel `channel` (0 left or mono, 1 right). */
export const coversChannel = (selection: WaveSelection, channel: number): boolean =>
  selection.channels === 'both' || selection.channels === (channel === 0 ? 'left' : 'right')

/**
 * What a right-click does before the menu opens, so the menu acts on what was clicked: inside the selection, on a
 * channel it covers, it keeps it; anywhere else it clears it and puts the cursor at the frame, as a click would.
 */
export const menuTargetAt = (selection: WaveSelection | null, frame: number, channel: number): 'keep' | { readonly cursor: number } =>
  selection && frame >= selection.from && frame <= selection.to && coversChannel(selection, channel) ? 'keep' : { cursor: frame }

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

/**
 * How far the view scrolls in one animation frame while a selection is dragged `distancePx` past the detail's edge
 * (negative: past the left one): a tenth of the distance in columns, at most a quarter of the view; none inside.
 */
export const autoScrollFrames = (distancePx: number, framesPerPixel: number, width: number): number =>
  Math.sign(distancePx) * Math.min(Math.abs(distancePx) / 10, width / 4) * framesPerPixel
