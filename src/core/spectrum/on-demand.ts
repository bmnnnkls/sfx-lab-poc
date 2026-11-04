import type { WaveView } from '../sample'
import type { SpectrumColumns } from './pyramid'
import { spectrumHop } from './pyramid'

/**
 * Columns on demand: zoomed in past the pyramid's hop, a view asks for its own columns, one FFT per pixel column but at
 * most one per `onDemandMinHop` frames (finer than that, a window this long shows nothing new). They are computed
 * for the view widened by `ON_DEMAND_MARGIN` on each side, so a small scroll still finds them, and drawn while the view
 * is at the same zoom and within them.
 */

/** Columns on demand are at least an eighth of the pyramid's hop apart: 64 frames at 2048. */
export const onDemandMinHop = (fftSize: number): number => spectrumHop(fftSize) / 8
/** The part of the view's width asked for beyond each edge. */
const ON_DEMAND_MARGIN = 0.25

/** A view's columns to compute: centred at `(firstColumn + i) · hop + hop / 2`, for `i` up to `count`. */
export interface SpectrumAsk {
  readonly sampleId: string
  readonly fftSize: number
  readonly hop: number
  readonly firstColumn: number
  readonly count: number
}

/** The answer: per channel, `count` columns of `bins` bytes. */
export interface SpectrumAnswered extends SpectrumAsk {
  readonly bins: number
  readonly bytes: readonly Uint8Array[]
}

/** The hop a view's columns on demand take, whole frames, or null when the view is at or above the pyramid's hop (the levels draw it). */
const onDemandHop = (view: WaveView, fftSize: number): number | null =>
  view.framesPerPixel >= spectrumHop(fftSize) ? null : Math.max(onDemandMinHop(fftSize), Math.round(view.framesPerPixel))

/** What `view` of a sample of `frames` frames asks for, or null when it doesn't need columns on demand. */
export const spectrumAsk = (view: WaveView, sampleId: string, fftSize: number, frames: number): SpectrumAsk | null => {
  const hop = onDemandHop(view, fftSize)
  if (hop === null || view.width <= 0) return null
  const margin = view.width * view.framesPerPixel * ON_DEMAND_MARGIN
  const from = Math.max(0, view.startFrame - margin)
  const to = Math.min(frames, view.startFrame + view.width * view.framesPerPixel + margin)
  if (to <= from) return null
  const firstColumn = Math.floor(from / hop)
  return { sampleId, fftSize, hop, firstColumn, count: Math.max(1, Math.ceil(to / hop) - firstColumn) }
}

/** The same ask: what was asked for is what this view needs. */
export const sameAsk = (a: SpectrumAsk | null, b: SpectrumAsk | null): boolean =>
  a === b || (!!a && !!b && a.sampleId === b.sampleId && a.fftSize === b.fftSize && a.hop === b.hop && a.firstColumn === b.firstColumn && a.count === b.count)

/** Each pixel column's columns of `ask`, `from` up to `to`; null when `ask` is for another zoom or doesn't cover the view inside the sample. */
const columnsOf = (view: WaveView, ask: SpectrumAsk, frames: number): { from: Int32Array; to: Int32Array } | null => {
  if (onDemandHop(view, ask.fftSize) !== ask.hop) return null
  const { hop, firstColumn, count } = ask
  const from = new Int32Array(view.width)
  const to = new Int32Array(view.width)
  for (let x = 0; x < view.width; x++) {
    const first = view.startFrame + x * view.framesPerPixel
    const last = Math.min(frames, view.startFrame + (x + 1) * view.framesPerPixel)
    if (first >= frames || last <= 0) continue
    const a = Math.floor(Math.max(0, first) / hop) - firstColumn
    const b = Math.max(a + 1, Math.ceil(last / hop) - firstColumn)
    if (a < 0 || b > count) return null
    from[x] = a
    to[x] = b
  }
  return { from, to }
}

/** `ask`'s columns are what `view` draws: the same zoom, over every frame of it inside the sample. */
export const askCovers = (ask: SpectrumAsk, view: WaveView, frames: number): boolean => columnsOf(view, ask, frames) !== null

/** What each pixel column of `view` draws from `answered` (as `spectrumColumnsFor` does from the pyramid), or null when it doesn't cover the view. */
export const onDemandColumnsFor = (view: WaveView, answered: SpectrumAnswered, frames: number): SpectrumColumns | null => {
  const columns = columnsOf(view, answered, frames)
  return columns && { kind: 'on-demand', bins: answered.bins, data: answered.bytes, ...columns, pending: false }
}
