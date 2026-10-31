import { type Fft, createFft } from './fft'
import { type WindowKind, windowOf } from './windows'

/** The levels a spectrum's bytes cover: 0 is this or quieter, 255 is 0 dB or louder. */
export const SPECTRUM_DB_FLOOR = -120

/** A level in dB as a byte over `SPECTRUM_DB_FLOOR` to 0 dB. */
export const dbToByte = (db: number): number => (db >= 0 ? 255 : db <= SPECTRUM_DB_FLOOR ? 0 : Math.round(((db - SPECTRUM_DB_FLOOR) / -SPECTRUM_DB_FLOOR) * 255))

/** The level a byte stands for, in dB. */
export const byteToDb = (byte: number): number => SPECTRUM_DB_FLOOR + (byte / 255) * -SPECTRUM_DB_FLOOR

export interface StftOptions {
  /** The FFT size, a power of two. */
  readonly size: number
  /** Frames between one column's window and the next's. */
  readonly hop: number
  readonly window: WindowKind
}

/**
 * Short-time Fourier transforms of a channel, one column at a time: each column's window is `size` frames centred on a
 * frame, and frames outside the channel read as zero. The buffers are made once; nothing is allocated per column.
 */
export interface Stft extends StftOptions {
  readonly bins: number
  /** The spectrum of the column centred on `centre`, in buffers the next call overwrites. */
  spectrum(channel: Float32Array, centre: number): { readonly re: Float64Array; readonly im: Float64Array }
  /** The column's level per bin in dB, scaled so a full-scale sine on a bin reads 0 dB. */
  magnitudes(channel: Float32Array, centre: number, out: Float64Array | Float32Array): void
  /** The column's levels as bytes (`dbToByte`), into `out` from `offset`. */
  bytes(channel: Float32Array, centre: number, out: Uint8Array, offset?: number): void
  /**
   * Adds the signal of a column's spectrum, windowed again, into `output` with its window centred on `centre`, scaled
   * so columns `hop` apart sum back to the signal they were taken from (for a window that overlaps to a constant at
   * that hop, as Hann does at a quarter of its size).
   */
  overlapAdd(re: Float64Array, im: Float64Array, centre: number, output: Float32Array | Float64Array): void
}

export const createStft = (options: StftOptions): Stft => {
  const { size, hop } = options
  const fft: Fft = createFft(size)
  const window = windowOf(options.window, size)
  const frame = new Float64Array(size)
  const re = new Float64Array(fft.bins)
  const im = new Float64Array(fft.bins)
  const signal = new Float64Array(size)
  let sum = 0
  let squares = 0
  for (const value of window) {
    sum += value
    squares += value * value
  }
  // A sine of amplitude A on bin k shows A·sum/2 there (A·sum at 0 Hz and at the Nyquist frequency).
  const scale = 2 / sum
  const edgeScale = 1 / sum
  // What the windows squared add up to at every frame, `hop` apart.
  const overlap = squares / hop
  const half = size / 2

  const spectrum = (channel: Float32Array, centre: number) => {
    const start = Math.round(centre) - half
    for (let n = 0; n < size; n++) {
      const at = start + n
      frame[n] = at >= 0 && at < channel.length ? channel[at]! * window[n]! : 0
    }
    fft.forward(frame, re, im)
    return { re, im }
  }

  const magnitudes = (channel: Float32Array, centre: number, out: Float64Array | Float32Array) => {
    spectrum(channel, centre)
    for (let k = 0; k < fft.bins; k++) {
      const level = Math.hypot(re[k]!, im[k]!) * (k === 0 || k === half ? edgeScale : scale)
      out[k] = level > 0 ? 20 * Math.log10(level) : -Infinity
    }
  }

  return {
    ...options,
    bins: fft.bins,
    spectrum,
    magnitudes,
    bytes: (channel, centre, out, offset = 0) => {
      spectrum(channel, centre)
      for (let k = 0; k < fft.bins; k++) {
        const level = Math.hypot(re[k]!, im[k]!) * (k === 0 || k === half ? edgeScale : scale)
        out[offset + k] = level > 0 ? dbToByte(20 * Math.log10(level)) : 0
      }
    },
    overlapAdd: (columnRe, columnIm, centre, output) => {
      fft.inverse(columnRe, columnIm, signal)
      const start = Math.round(centre) - half
      for (let n = 0; n < size; n++) {
        const at = start + n
        if (at >= 0 && at < output.length) output[at] = output[at]! + (signal[n]! * window[n]!) / overlap
      }
    },
  }
}
