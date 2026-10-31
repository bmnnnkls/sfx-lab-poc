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
 * How a lane is drawn, in CSS pixels (the canvases are already scaled): `draw` fills the lane with one channel, `scale`
 * the gutter beside it with the lane's scale. The waveform is the only one now; a spectrogram is a second renderer.
 */
export interface LaneRenderer {
  draw(context: CanvasRenderingContext2D, columns: LaneColumns, size: LaneSize, colors: LaneColors): void
  scale(context: CanvasRenderingContext2D, size: LaneSize, colors: LaneColors): void
}

/** The level scale's marks, in dB; −∞ is the middle line. */
const LEVEL_MARKS_DB = [0, -6, -12, -Infinity] as const
/** A label needs this much room from the one above it. */
const LABEL_PX = 11

/** Where each level mark is in a lane `height` high: a line above and one below the middle (one at −∞), and a label where there is room. */
export const levelMarks = (height: number): readonly { readonly ys: readonly number[]; readonly label: string | null }[] => {
  const middle = height / 2
  let last = -Infinity
  return LEVEL_MARKS_DB.map((db) => {
    const above = middle - 10 ** (db / 20) * middle
    const room = above - last >= LABEL_PX
    if (room) last = above
    return { ys: db === -Infinity ? [middle] : [above, height - above], label: room ? (db === -Infinity ? '−∞' : db === 0 ? '0' : `−${-db}`) : null }
  })
}

/** The channel's part of the view's columns. */
export const laneColumns = (columns: WaveColumns, channel: number, view: WaveView): LaneColumns =>
  columns.kind === 'points'
    ? { kind: 'points', firstFrame: columns.firstFrame, values: columns.values[channel]!, dots: columns.dots, view }
    : { kind: columns.kind, min: columns.min[channel]!, max: columns.max[channel]! }

/** Min and max as a bar per column, or the sample points joined by a line (with dots when zoomed far in). */
const drawWaveform: LaneRenderer['draw'] = (context, columns, { width, height }, colors) => {
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

/** The level scale: a tick at the gutter's right edge per mark, mirrored below the middle, labelled where there is room. */
const drawLevelScale: LaneRenderer['scale'] = (context, { width, height }, colors) => {
  context.fillStyle = colors.line
  context.font = '9px system-ui, sans-serif'
  context.textBaseline = 'middle'
  context.textAlign = 'right'
  for (const mark of levelMarks(height)) {
    for (const y of mark.ys) context.fillRect(width - 4, Math.min(height - 1, Math.max(0, Math.round(y))), 4, 1)
    if (mark.label) context.fillText(mark.label, width - 6, Math.min(height - 5, Math.max(5, mark.ys[0]!)))
  }
}

export const waveformRenderer: LaneRenderer = { draw: drawWaveform, scale: drawLevelScale }
