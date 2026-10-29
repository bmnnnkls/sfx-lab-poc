import type { WaveColumns, WaveView } from '@core'

/** One channel of what the view shows (`columnsFor`), for one lane. */
export type LaneColumns =
  | { readonly kind: 'peaks' | 'frames'; readonly min: Float32Array; readonly max: Float32Array }
  | { readonly kind: 'points'; readonly firstFrame: number; readonly values: Float32Array; readonly dots: boolean; readonly view: WaveView }

/** A lane's box in CSS pixels, and the device pixel ratio its canvas is drawn at. */
export interface LaneSize {
  readonly width: number
  readonly height: number
}

export interface LaneColors {
  readonly wave: string
  readonly line: string
}

/**
 * Draws one channel into a lane's canvas, in CSS pixels (the canvas is already scaled). The waveform is the only one
 * now; a spectrogram is a second renderer beside it.
 */
export type LaneRenderer = (context: CanvasRenderingContext2D, columns: LaneColumns, size: LaneSize, colors: LaneColors) => void

/** The channel's part of the view's columns. */
export const laneColumns = (columns: WaveColumns, channel: number, view: WaveView): LaneColumns =>
  columns.kind === 'points'
    ? { kind: 'points', firstFrame: columns.firstFrame, values: columns.values[channel]!, dots: columns.dots, view }
    : { kind: columns.kind, min: columns.min[channel]!, max: columns.max[channel]! }

/** Min and max as a bar per column, or the sample points joined by a line (with dots when zoomed far in). */
export const drawWaveform: LaneRenderer = (context, columns, { width, height }, colors) => {
  const middle = height / 2
  const y = (value: number) => middle - Math.max(-1, Math.min(1, value)) * middle
  context.fillStyle = colors.line
  context.fillRect(0, Math.floor(middle), width, 1)
  context.fillStyle = colors.wave
  context.strokeStyle = colors.wave
  if (columns.kind !== 'points') {
    for (let x = 0; x < columns.min.length; x++) {
      const low = columns.min[x]!
      const high = columns.max[x]!
      if (Number.isNaN(low)) continue
      const top = y(high)
      context.fillRect(x, top, 1, Math.max(1, y(low) - top))
    }
    return
  }
  const { values, firstFrame, view } = columns
  const xAt = (index: number) => (firstFrame + index - view.startFrame) / view.framesPerPixel
  context.beginPath()
  values.forEach((value, index) => (index === 0 ? context.moveTo(xAt(index), y(value)) : context.lineTo(xAt(index), y(value))))
  context.lineWidth = 1
  context.stroke()
  if (columns.dots) values.forEach((value, index) => context.fillRect(xAt(index) - 1.5, y(value) - 1.5, 3, 3))
}
