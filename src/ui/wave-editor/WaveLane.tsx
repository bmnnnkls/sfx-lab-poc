import type { FrequencyBand } from '@core'
import { useCallback, useEffect, useRef } from 'react'
import { useThemeColors } from '../theme/theme-colors'
import { type LaneData, type LanePart, type LaneRenderers, partBox } from './lane-renderers'
import type { FrequencyScale } from './use-lane-renderers'
import styles from './WaveEditor.module.css'

/**
 * What a lane shows over its audio, in columns: the selection (when it covers this channel) and its band, the cursor,
 * a line at each marker, and faint lines at region and loop edges.
 */
export interface LaneOverlay {
  readonly selection: { readonly from: number; readonly to: number; readonly band: FrequencyBand | null } | null
  readonly cursor: number | null
  readonly markers: readonly number[]
  readonly edges: readonly number[]
}

export interface WaveLaneHandle {
  draw(data: LaneData, overlay: LaneOverlay): void
}

const LANE_COLORS = ['--accent', '--border', '--selection', '--text-dim', '--text'] as const
const SCALE_COLORS = ['--text-dim'] as const

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
 * One channel's lane: a canvas the size of its box times the device pixel ratio, its parts (`laneParts`: the waveform,
 * the spectrogram, or both) each drawn by its renderer when the detail view asks (`handle`), never by React rendering.
 * The selection is a veil under the waveform and over the spectrogram, with a line at each edge there; a box (a band)
 * is a veil and an outline over the spectrogram, its rows from `frequencies`, and the time veil under the waveform.
 */
export const WaveLane = ({
  label,
  parts,
  renderers,
  frequencies,
  handle,
}: {
  label: string
  parts: readonly LanePart[]
  renderers: LaneRenderers
  frequencies: FrequencyScale
  handle(lane: WaveLaneHandle | null): void
}) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const theme = useThemeColors(LANE_COLORS)
  const attach = useCallback(
    (element: HTMLCanvasElement | null) => {
      canvas.current = element
      if (!element) return handle(null)
      handle({
        draw: (data, overlay) => {
          const fit = fitted(element)
          if (!fit) return
          const { context, width, height } = fit
          const accent = theme['--accent']
          const colors = { wave: accent, line: theme['--border'] }
          const selection = overlay.selection
          const veil = (top: number, partHeight: number) => {
            if (!selection) return
            context.fillStyle = theme['--selection']
            context.fillRect(selection.from, top, Math.max(1, selection.to - selection.from), partHeight)
          }
          for (const part of parts) {
            const box = partBox(part, height)
            context.save()
            context.beginPath()
            context.rect(0, box.top, width, box.height)
            context.clip()
            context.translate(0, box.top)
            const size = { width, height: box.height }
            if (part.kind === 'waveform') {
              veil(0, box.height)
              if (data.waveform) renderers.waveform.draw(context, data.waveform, size, colors)
            } else {
              renderers.spectrogram.draw(context, data.spectrogram ?? null, size, colors)
              if (selection?.band) {
                const top = Math.round(frequencies.rowOf(selection.band.high, box.height))
                const bottom = Math.round(frequencies.rowOf(selection.band.low, box.height))
                veil(top, Math.max(1, bottom - top))
                context.strokeStyle = accent
                context.lineWidth = 1
                context.strokeRect(Math.round(selection.from) + 0.5, top + 0.5, Math.max(1, Math.round(selection.to) - Math.round(selection.from)), Math.max(1, bottom - top - 1))
              } else if (selection) {
                veil(0, box.height)
                context.fillStyle = accent
                context.fillRect(Math.round(selection.from), 0, 1, box.height)
                context.fillRect(Math.round(selection.to), 0, 1, box.height)
              }
            }
            context.restore()
            if (box.top > 0) {
              context.fillStyle = colors.line
              context.fillRect(0, box.top, width, 1)
            }
          }
          if (overlay.edges.length > 0 || overlay.markers.length > 0) {
            context.fillStyle = theme['--text-dim']
            context.globalAlpha = 0.35
            for (const x of overlay.edges) context.fillRect(Math.round(x), 0, 1, height)
            context.globalAlpha = 0.8
            for (const x of overlay.markers) context.fillRect(Math.round(x), 0, 1, height)
            context.globalAlpha = 1
          }
          if (overlay.cursor !== null) {
            context.fillStyle = theme['--text']
            context.fillRect(Math.round(overlay.cursor), 0, 1, height)
          }
        },
      })
    },
    [handle, parts, renderers, frequencies, theme],
  )
  return (
    <div className={styles.lane}>
      <canvas ref={attach} className={styles.laneCanvas} role="img" aria-label={label} />
      <span className={styles.laneLabel}>{label}</span>
    </div>
  )
}

/**
 * A lane's scale, in the gutter beside it: its own canvas, each part's drawn by its renderer's `scale` when it mounts,
 * when its box changes size and when the renderers change, never on zoom or scroll.
 */
export const LaneScale = ({ parts, renderers }: { parts: readonly LanePart[]; renderers: LaneRenderers }) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const theme = useThemeColors(SCALE_COLORS)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () => {
      const fit = fitted(element)
      if (!fit) return
      const dim = theme['--text-dim']
      for (const part of parts) {
        const box = partBox(part, fit.height)
        fit.context.save()
        fit.context.translate(0, box.top)
        renderers[part.kind].scale(fit.context, { width: fit.width, height: box.height }, { wave: dim, line: dim })
        fit.context.restore()
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    return () => observer.disconnect()
  }, [parts, renderers, theme])
  return (
    <div className={styles.lane}>
      <canvas ref={canvas} className={styles.laneCanvas} aria-hidden="true" />
    </div>
  )
}
