import type { WaveView } from '@core'
import type { WaveEditorView } from '@state'

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

/** The frame under column `x` (fractional columns are fine), inside the sample. */
export const frameAt = (view: WaveView, x: number, frames: number): number =>
  Math.max(0, Math.min(frames, Math.round(view.startFrame + x * view.framesPerPixel)))

/** Where a frame is, in columns from the left edge. */
export const xOf = (view: WaveView, frame: number): number => (frame - view.startFrame) / view.framesPerPixel
