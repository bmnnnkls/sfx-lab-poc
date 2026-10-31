import type { SampleAudio, WaveView } from '../sample'
import { createStft } from './stft'
import type { WindowKind } from './windows'

/**
 * The spectrum pyramid: what the wave editor draws a spectrogram from. Level 0 has a column per hop (a quarter of the
 * FFT size), its window centred on the middle of its hop, holding a byte per bin per channel (`dbToByte`); each next
 * level keeps the loudest of two columns per bin, until a level has at most `SPECTRUM_TOP` columns. It is filled in
 * parts (`fillSpectrum`), so a worker can build it in chunks and a view can draw what is there. Nothing outside this
 * file reads the levels' layout but `spectrumColumnsFor`'s answer.
 */

/** The FFT sizes the spectrogram offers. */
export const SPECTRUM_FFT_SIZES = [1024, 2048, 4096] as const
export type SpectrumFftSize = (typeof SPECTRUM_FFT_SIZES)[number]
export const DEFAULT_SPECTRUM_FFT_SIZE: SpectrumFftSize = 2048

export const isSpectrumFftSize = (value: unknown): value is SpectrumFftSize => SPECTRUM_FFT_SIZES.includes(value as SpectrumFftSize)

/** The window the spectrogram looks through: its sidelobes stay under the color scale's lowest floor. */
export const SPECTRUM_WINDOW: WindowKind = 'blackman-harris'
const HOP_PER_SIZE = 1 / 4
const SPECTRUM_TOP = 512
/** Base columns a chunk of the fill holds: about half a megabyte for stereo at 2048. */
export const SPECTRUM_CHUNK_COLUMNS = 256

export const spectrumHop = (fftSize: number): number => fftSize * HOP_PER_SIZE

interface SpectrumLevel {
  /** Base columns per column. */
  readonly span: number
  /** Frames per column. */
  readonly hop: number
  readonly count: number
  /** Per channel, `count` columns of `bins` bytes. */
  readonly data: readonly Uint8Array[]
  /** Per column, 1 once every base column under it is filled. */
  readonly filled: Uint8Array
}

export interface SpectrumPyramid {
  readonly frames: number
  readonly channels: number
  readonly sampleRate: number
  readonly fftSize: number
  readonly hop: number
  readonly bins: number
  readonly levels: readonly SpectrumLevel[]
}

const levelCounts = (frames: number, hop: number): number[] => {
  const counts = [Math.ceil(frames / hop)]
  while (counts[counts.length - 1]! > SPECTRUM_TOP) counts.push(Math.ceil(counts[counts.length - 1]! / 2))
  return counts
}

/** The bytes a pyramid of `frames` frames and `channels` channels takes at `fftSize`, every level counted. */
export const spectrumBytes = (frames: number, channels: number, fftSize: number): number =>
  levelCounts(frames, spectrumHop(fftSize)).reduce((total, count) => total + count, 0) * (fftSize / 2 + 1) * channels

/** An empty pyramid: every column at the floor, none filled. */
export const createSpectrumPyramid = (frames: number, channels: number, fftSize: number, sampleRate: number): SpectrumPyramid => {
  const hop = spectrumHop(fftSize)
  const bins = fftSize / 2 + 1
  const levels = levelCounts(frames, hop).map((count, index) => ({
    span: 2 ** index,
    hop: hop * 2 ** index,
    count,
    data: Array.from({ length: channels }, () => new Uint8Array(count * bins)),
    filled: new Uint8Array(count),
  }))
  return { frames, channels, sampleRate, fftSize, hop, bins, levels }
}

/** The frame base column `column`'s window is centred on: the middle of its hop. */
const centreOf = (pyramid: SpectrumPyramid, column: number) => column * pyramid.hop + pyramid.hop / 2

/** Level `index`'s columns `from` up to `to`, from the level below. */
const fillLevel = (pyramid: SpectrumPyramid, index: number, from: number, to: number) => {
  const level = pyramid.levels[index]!
  const below = pyramid.levels[index - 1]!
  const { bins } = pyramid
  for (let column = from; column < to; column++) {
    const a = 2 * column
    const b = a + 1 < below.count ? a + 1 : a
    level.filled[column] = below.filled[a]! & below.filled[b]!
    level.data.forEach((data, channel) => {
      const source = below.data[channel]!
      const at = column * bins
      const first = a * bins
      const second = b * bins
      for (let bin = 0; bin < bins; bin++) {
        const x = source[first + bin]!
        const y = source[second + bin]!
        data[at + bin] = x > y ? x : y
      }
    })
  }
}

/** Computes base columns `from` up to `to` of every channel from `audio`, and the columns above them in every level. */
export const fillSpectrum = (pyramid: SpectrumPyramid, audio: SampleAudio, from: number, to: number): void => {
  const base = pyramid.levels[0]
  if (!base) return
  const start = Math.max(0, from)
  const end = Math.min(base.count, to)
  if (end <= start) return
  const stft = createStft({ size: pyramid.fftSize, hop: pyramid.hop, window: SPECTRUM_WINDOW })
  audio.channels.forEach((channel, index) => {
    const data = base.data[index]!
    for (let column = start; column < end; column++) stft.bytes(channel, centreOf(pyramid, column), data, column * pyramid.bins)
  })
  base.filled.fill(1, start, end)
  for (let index = 1; index < pyramid.levels.length; index++) {
    const span = pyramid.levels[index]!.span
    fillLevel(pyramid, index, Math.floor(start / span), Math.min(pyramid.levels[index]!.count, Math.ceil(end / span)))
  }
}

/**
 * Writes base columns computed elsewhere (a worker's chunk: `bytes` per channel, `to − from` columns of `bins`) into
 * the pyramid, and the columns above them in every level.
 */
export const putSpectrumColumns = (pyramid: SpectrumPyramid, from: number, to: number, bytes: readonly Uint8Array[]): void => {
  const base = pyramid.levels[0]
  if (!base || to <= from) return
  base.data.forEach((data, channel) => data.set(bytes[channel]!.subarray(0, (to - from) * pyramid.bins), from * pyramid.bins))
  base.filled.fill(1, from, to)
  for (let index = 1; index < pyramid.levels.length; index++) {
    const span = pyramid.levels[index]!.span
    fillLevel(pyramid, index, Math.floor(from / span), Math.min(pyramid.levels[index]!.count, Math.ceil(to / span)))
  }
}

/**
 * The bytes of columns `from` up to `to` of `channel`, each centred at `column · hop + hop / 2`: base columns (the
 * default hop) as a worker computes them for `putSpectrumColumns`, or a view's columns on demand at their own hop.
 */
export const spectrumColumnBytes = (fftSize: number, channel: Float32Array, from: number, to: number, offset = 0, hop = spectrumHop(fftSize)): Uint8Array => {
  const bins = fftSize / 2 + 1
  const stft = createStft({ size: fftSize, hop: spectrumHop(fftSize), window: SPECTRUM_WINDOW })
  const out = new Uint8Array(Math.max(0, to - from) * bins)
  // `channel` may be a slice of the sample's channel starting at frame `offset`.
  for (let column = from; column < to; column++) stft.bytes(channel, column * hop + hop / 2 - offset, out, (column - from) * bins)
  return out
}

/** The frames columns `from` up to `to` read (`hop` apart, base columns by default): their windows, clamped to the sample. */
export const framesRead = (pyramid: Pick<SpectrumPyramid, 'fftSize' | 'hop' | 'frames'>, from: number, to: number): { from: number; to: number } => ({
  from: Math.max(0, Math.floor(from * pyramid.hop + pyramid.hop / 2 - pyramid.fftSize / 2)),
  to: Math.min(pyramid.frames, Math.ceil((to - 1) * pyramid.hop + pyramid.hop / 2 + pyramid.fftSize / 2)),
})

export const buildSpectrumPyramid = (audio: SampleAudio, fftSize: number): SpectrumPyramid => {
  const frames = audio.channels[0]?.length ?? 0
  const pyramid = createSpectrumPyramid(frames, audio.channels.length, fftSize, audio.sampleRate)
  fillSpectrum(pyramid, audio, 0, pyramid.levels[0]?.count ?? 0)
  return pyramid
}

/**
 * The pyramid of `audio` after an edit, from the one before it (`previous`) and the output frames the edit changed
 * (`changed`, `changedFrames`): the columns whose windows lie wholly before `changed.from` (and, when the length is the
 * same, wholly from `changed.to` on) are copied, with the level columns wholly over them; the rest are left to fill
 * (`columnsToFill`). Once they are filled, it equals `buildSpectrumPyramid(audio)`, byte for byte.
 */
export const updateSpectrumPyramid = (previous: SpectrumPyramid, audio: SampleAudio, changed: { readonly from: number; readonly to: number }): SpectrumPyramid => {
  const frames = audio.channels[0]?.length ?? 0
  const pyramid = createSpectrumPyramid(frames, audio.channels.length, previous.fftSize, audio.sampleRate)
  if (previous.channels !== pyramid.channels || previous.sampleRate !== pyramid.sampleRate) return pyramid
  const { hop, fftSize, bins } = pyramid
  const count = pyramid.levels[0]?.count ?? 0
  const oldCount = previous.levels[0]?.count ?? 0
  // Column c's window is [c·hop + hop/2 − size/2, c·hop + hop/2 + size/2).
  const before = Math.max(0, Math.min(count, oldCount, Math.floor((changed.from - hop / 2 - fftSize / 2) / hop) + 1))
  const after = frames === previous.frames ? Math.max(before, Math.min(count, Math.ceil((changed.to + fftSize / 2 - hop / 2) / hop))) : count
  pyramid.levels.forEach((level, index) => {
    const old = previous.levels[index]
    if (!old) return
    const { span } = level
    const copy = (from: number, to: number) => {
      if (to <= from) return
      level.data.forEach((data, channel) => data.set(old.data[channel]!.subarray(from * bins, to * bins), from * bins))
      level.filled.set(old.filled.subarray(from, to), from)
    }
    copy(0, Math.min(old.count, Math.floor(before / span)))
    if (after < count) copy(Math.ceil(after / span), Math.min(level.count, old.count))
  })
  return pyramid
}

/** The base columns not filled yet, as ranges in order. */
export const columnsToFill = (pyramid: SpectrumPyramid): { from: number; to: number }[] => {
  const filled = pyramid.levels[0]?.filled
  const ranges: { from: number; to: number }[] = []
  if (!filled) return ranges
  for (let column = 0; column < filled.length; column++) {
    if (filled[column]) continue
    const last = ranges[ranges.length - 1]
    if (last && last.to === column) last.to = column + 1
    else ranges.push({ from: column, to: column + 1 })
  }
  return ranges
}

/**
 * The chunks to fill, at most `SPECTRUM_CHUNK_COLUMNS` base columns each: those over the frames `around` (a view)
 * first, then the rest, nearest to them first.
 */
export const spectrumChunks = (pyramid: SpectrumPyramid, around?: { readonly from: number; readonly to: number }, size = SPECTRUM_CHUNK_COLUMNS): { from: number; to: number }[] => {
  const chunks = columnsToFill(pyramid).flatMap(({ from, to }) => {
    const parts: { from: number; to: number }[] = []
    for (let at = from; at < to; at += size) parts.push({ from: at, to: Math.min(to, at + size) })
    return parts
  })
  if (!around) return chunks
  const first = Math.floor(around.from / pyramid.hop)
  const last = Math.ceil(around.to / pyramid.hop)
  const distance = (chunk: { from: number; to: number }) => (chunk.to <= first ? first - chunk.to + 1 : chunk.from >= last ? chunk.from - last + 1 : 0)
  return chunks.map((chunk, index) => ({ chunk, index, distance: distance(chunk) })).sort((a, b) => a.distance - b.distance || a.index - b.index).map(({ chunk }) => chunk)
}

/**
 * What each pixel column of `view` draws, per channel: the columns `from[x]` up to `to[x]` of `data` (`bins` bytes
 * each), loudest per bin; `from[x] === to[x]` outside the sample.
 * * `levels` (a hop and more frames a pixel): from the finest level whose column fits in a pixel column;
 * * `stretched` (under a hop): the base column under the pixel's middle, over several pixels;
 * * `on-demand`: the view's own columns (`onDemandColumnsFor`), never from the pyramid.
 * `pending` while a column in view isn't filled yet (it reads as the floor meanwhile).
 */
export interface SpectrumColumns {
  readonly kind: 'levels' | 'stretched' | 'on-demand'
  readonly bins: number
  readonly data: readonly Uint8Array[]
  readonly from: Int32Array
  readonly to: Int32Array
  readonly pending: boolean
}

export const spectrumColumnsFor = (view: WaveView, pyramid: SpectrumPyramid): SpectrumColumns => {
  const { startFrame, framesPerPixel, width } = view
  const kind = framesPerPixel >= pyramid.hop ? 'levels' : 'stretched'
  let level = pyramid.levels[0]!
  if (kind === 'levels') for (const candidate of pyramid.levels) if (candidate.hop <= framesPerPixel) level = candidate
  const from = new Int32Array(width)
  const to = new Int32Array(width)
  let pending = false
  for (let x = 0; x < width; x++) {
    const first = startFrame + x * framesPerPixel
    const last = startFrame + (x + 1) * framesPerPixel
    if (first >= pyramid.frames || last <= 0 || level.count === 0) continue
    let a: number
    let b: number
    if (kind === 'stretched') {
      a = Math.min(level.count - 1, Math.max(0, Math.floor((first + last) / 2 / level.hop)))
      b = a + 1
    } else {
      a = Math.max(0, Math.floor(first / level.hop))
      b = Math.min(level.count, Math.max(a + 1, Math.ceil(last / level.hop)))
    }
    from[x] = a
    to[x] = b
    if (!pending) for (let column = a; column < b; column++) if (!level.filled[column]) pending = true
  }
  return { kind, bins: pyramid.bins, data: level.data, from, to, pending }
}
