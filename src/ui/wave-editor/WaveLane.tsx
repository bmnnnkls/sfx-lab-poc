import { useCallback, useEffect, useRef } from 'react'
import type { LaneColumns, LaneRenderer } from './lane-renderers'
import styles from './WaveEditor.module.css'

/**
 * What a lane shows over its audio, in columns: the selection (when it covers this channel), the cursor, a line at each
 * marker, and faint lines at region and loop edges.
 */
export interface LaneOverlay {
  readonly selection: { readonly from: number; readonly to: number } | null
  readonly cursor: number | null
  readonly markers: readonly number[]
  readonly edges: readonly number[]
}

export interface WaveLaneHandle {
  draw(columns: LaneColumns, overlay: LaneOverlay): void
}

const color = (element: Element, name: string, fallback: string) => getComputedStyle(element).getPropertyValue(name).trim() || fallback

/** Fits a canvas to its box at the device pixel ratio; returns its context in CSS pixels, or null. */
const fitted = (element: HTMLCanvasElement) => {
  const context = element.getContext('2d')
  if (!context) return null
  const ratio = window.devicePixelRatio || 1
  const width = element.clientWidth
  const height = element.clientHeight
  if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
    element.width = Math.round(width * ratio)
    element.height = Math.round(height * ratio)
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  return { context, width, height }
}

/**
 * One channel's lane: a canvas the size of its box times the device pixel ratio, drawn by `renderer` when the detail
 * view asks (`handle`), never by React rendering.
 */
export const WaveLane = ({ label, renderer, handle }: { label: string; renderer: LaneRenderer; handle(lane: WaveLaneHandle | null): void }) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const attach = useCallback(
    (element: HTMLCanvasElement | null) => {
      canvas.current = element
      if (!element) return handle(null)
      handle({
        draw: (columns, overlay) => {
          const fit = fitted(element)
          if (!fit) return
          const { context, width, height } = fit
          const accent = color(element, '--accent', '#f5a524')
          if (overlay.selection) {
            context.fillStyle = color(element, '--wave-selection', 'rgba(245, 165, 36, 0.25)')
            context.fillRect(overlay.selection.from, 0, Math.max(1, overlay.selection.to - overlay.selection.from), height)
          }
          renderer.draw(context, columns, { width, height }, { wave: accent, line: color(element, '--border', '#444') })
          if (overlay.edges.length > 0 || overlay.markers.length > 0) {
            context.fillStyle = color(element, '--text-dim', '#888')
            context.globalAlpha = 0.35
            for (const x of overlay.edges) context.fillRect(Math.round(x), 0, 1, height)
            context.globalAlpha = 0.8
            for (const x of overlay.markers) context.fillRect(Math.round(x), 0, 1, height)
            context.globalAlpha = 1
          }
          if (overlay.cursor !== null) {
            context.fillStyle = color(element, '--text', '#fff')
            context.fillRect(Math.round(overlay.cursor), 0, 1, height)
          }
        },
      })
    },
    [handle, renderer],
  )
  return (
    <div className={styles.lane}>
      <canvas ref={attach} className={styles.laneCanvas} role="img" aria-label={label} />
      <span className={styles.laneLabel}>{label}</span>
    </div>
  )
}

/**
 * A lane's scale, in the gutter beside it: its own canvas, drawn by the renderer's `scale` when it mounts and when its
 * box changes size, never on zoom or scroll.
 */
export const LaneScale = ({ renderer }: { renderer: LaneRenderer }) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () => {
      const fit = fitted(element)
      if (!fit) return
      const dim = color(element, '--text-dim', '#888')
      renderer.scale(fit.context, { width: fit.width, height: fit.height }, { wave: dim, line: dim })
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    return () => observer.disconnect()
  }, [renderer])
  return (
    <div className={styles.lane}>
      <canvas ref={canvas} className={styles.laneCanvas} aria-hidden="true" />
    </div>
  )
}
