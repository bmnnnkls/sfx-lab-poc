import { useCallback, useRef } from 'react'
import type { LaneColumns, LaneRenderer } from './lane-renderers'
import styles from './WaveEditor.module.css'

/** What a lane shows over its audio: the selection (when it covers this channel) and the cursor, in columns. */
export interface LaneOverlay {
  readonly selection: { readonly from: number; readonly to: number } | null
  readonly cursor: number | null
}

export interface WaveLaneHandle {
  draw(columns: LaneColumns, overlay: LaneOverlay): void
}

const color = (element: Element, name: string, fallback: string) => getComputedStyle(element).getPropertyValue(name).trim() || fallback

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
          const context = element.getContext('2d')
          if (!context) return
          const ratio = window.devicePixelRatio || 1
          const width = element.clientWidth
          const height = element.clientHeight
          if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
            element.width = Math.round(width * ratio)
            element.height = Math.round(height * ratio)
          }
          context.setTransform(ratio, 0, 0, ratio, 0, 0)
          context.clearRect(0, 0, width, height)
          const accent = color(element, '--accent', '#f5a524')
          if (overlay.selection) {
            context.fillStyle = color(element, '--wave-selection', 'rgba(245, 165, 36, 0.25)')
            context.fillRect(overlay.selection.from, 0, Math.max(1, overlay.selection.to - overlay.selection.from), height)
          }
          renderer(context, columns, { width, height }, { wave: accent, line: color(element, '--border', '#444') })
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
