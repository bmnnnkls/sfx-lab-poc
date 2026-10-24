import type { Point } from './geometry'

export interface Viewport extends Point {
  readonly zoom: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2

export const canvasPoint = (point: Point, view: Viewport): Point => ({
  x: (point.x - view.x) / view.zoom,
  y: (point.y - view.y) / view.zoom,
})

/** Keep the canvas point under the cursor stationary as the scale changes. */
export const zoomAt = (view: Viewport, zoom: number, anchor: Point): Viewport => {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
  const point = canvasPoint(anchor, view)
  return { x: anchor.x - point.x * next, y: anchor.y - point.y * next, zoom: next }
}
