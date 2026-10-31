import type { SpectrumColumns, WaveColumns, WaveView } from '@core'
import type { WaveLanes } from '@state'

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

/** One channel of what the view's spectrum shows (`spectrumColumnsFor`), for one lane. */
export interface SpectrumLaneColumns {
  readonly kind: SpectrumColumns['kind']
  readonly bins: number
  /** The channel's columns, `bins` bytes each. */
  readonly data: Uint8Array
  /** Per pixel column, the columns of `data` it draws, loudest per bin; none where `from === to`. */
  readonly from: Int32Array
  readonly to: Int32Array
}

/** What a lane draws from: the waveform's columns and the spectrum's, each there when the lane mode shows it. */
export interface LaneData {
  readonly waveform?: LaneColumns
  readonly spectrogram?: SpectrumLaneColumns | null
}

/**
 * How a lane is drawn, in CSS pixels (the canvases are already scaled): `draw` fills its part of the lane with one
 * channel, `scale` its part of the gutter beside it with the lane's scale.
 */
export interface LaneRenderer<Data> {
  draw(context: CanvasRenderingContext2D, data: Data, size: LaneSize, colors: LaneColors): void
  scale(context: CanvasRenderingContext2D, size: LaneSize, colors: LaneColors): void
}

/** The renderer of each kind of lane part. */
export interface LaneRenderers {
  readonly waveform: LaneRenderer<LaneColumns>
  /** Draws nothing but the floor where the spectrum isn't there yet (`null`). */
  readonly spectrogram: LaneRenderer<SpectrumLaneColumns | null>
}

export type LanePartKind = keyof LaneRenderers

/** In *Split*, the waveform's part of the lane, over the spectrogram. */
export const SPLIT_WAVE_SHARE = 1 / 3

/** A part of a lane: what it shows, and where, as parts of the lane's height. */
export interface LanePart {
  readonly kind: LanePartKind
  readonly top: number
  readonly share: number
}

/** The parts of every lane in a lane mode. */
export const laneParts = (lanes: WaveLanes): readonly LanePart[] =>
  lanes === 'waveform'
    ? [{ kind: 'waveform', top: 0, share: 1 }]
    : lanes === 'spectrogram'
      ? [{ kind: 'spectrogram', top: 0, share: 1 }]
      : [
          { kind: 'waveform', top: 0, share: SPLIT_WAVE_SHARE },
          { kind: 'spectrogram', top: SPLIT_WAVE_SHARE, share: 1 - SPLIT_WAVE_SHARE },
        ]

/** A part's box in a lane `height` high, in whole pixels. */
export const partBox = (part: LanePart, height: number): { readonly top: number; readonly height: number } => {
  const top = Math.round(part.top * height)
  return { top, height: Math.round((part.top + part.share) * height) - top }
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

/** The channel's part of the view's spectrum. */
export const spectrumLaneColumns = (columns: SpectrumColumns, channel: number): SpectrumLaneColumns => ({
  kind: columns.kind,
  bins: columns.bins,
  data: columns.data[channel]!,
  from: columns.from,
  to: columns.to,
})

/** Min and max as a bar per column, or the sample points joined by a line (with dots when zoomed far in). */
const drawWaveform: LaneRenderer<LaneColumns>['draw'] = (context, columns, { width, height }, colors) => {
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
const drawLevelScale: LaneRenderer<LaneColumns>['scale'] = (context, { width, height }, colors) => {
  context.fillStyle = colors.line
  context.font = '9px system-ui, sans-serif'
  context.textBaseline = 'middle'
  context.textAlign = 'right'
  for (const mark of levelMarks(height)) {
    for (const y of mark.ys) context.fillRect(width - 4, Math.min(height - 1, Math.max(0, Math.round(y))), 4, 1)
    if (mark.label) context.fillText(mark.label, width - 6, Math.min(height - 5, Math.max(5, mark.ys[0]!)))
  }
}

export const waveformRenderer: LaneRenderer<LaneColumns> = { draw: drawWaveform, scale: drawLevelScale }
