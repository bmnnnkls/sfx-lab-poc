import type { EditChannels, FrameRange, SampleAudio } from '../sample'
import { createStft } from './stft'

/**
 * Edits of a frequency band in a time range (round 11d-2): the box a drag in the spectrogram selects. Each one filters
 * the range through a short-time Fourier transform, weighting each bin, and adds what changed back to the audio, eased
 * in and out at the range's edges in time and at the band's edges in frequency. Audio outside the range never changes,
 * as with the processes; inside it, a band at 0 dB changes nothing, bit for bit.
 */

/** A band of frequencies in Hz, `0 ≤ low < high ≤` the Nyquist frequency. */
export interface FrequencyBand {
  readonly low: number
  readonly high: number
}

/** How a band edit eases in: over `frames` at each edge of the range, and `octaves` at each edge of the band, inside them. */
export interface BandFeather {
  readonly frames: number
  readonly octaves: number
}

interface BandRanged {
  readonly range: FrameRange
  readonly channels: EditChannels
  readonly band: FrequencyBand
  readonly feather: BandFeather
}

export type BandEdit =
  | ({ readonly kind: 'band-gain'; readonly db: number } & BandRanged)
  | ({ readonly kind: 'keep-band' } & BandRanged)

/** The FFT size band edits filter with: 23 Hz bins and 43 ms windows at 48 kHz. */
export const BAND_EDIT_FFT_SIZE = 2048
const HOP = BAND_EDIT_FFT_SIZE / 4
/** A band's edges ease over a sixth of an octave. */
export const BAND_FEATHER_OCTAVES = 1 / 6
/** Band gain takes −60 to +12 dB, or removes the band (−∞). */
export const BAND_GAIN_RANGE_DB = { min: -60, max: 12 } as const

/** The range inside a sample of `frames` frames, whole frames, in order. */
const clampTo = (frames: number, { from, to }: FrameRange): FrameRange => {
  const clamp = (frame: number) => Math.max(0, Math.min(frames, Math.round(frame)))
  return { from: clamp(Math.min(from, to)), to: clamp(Math.max(from, to)) }
}

/** The frames a band edit changes in a sample of `frames` frames: its range. */
export const bandEditChanged = (edit: BandEdit, frames: number): FrameRange => clampTo(frames, edit.range)

/** The frames a band edit reads: its range and a window on each side, inside the sample. */
export const bandEditReads = (edit: BandEdit, frames: number): FrameRange => {
  const { from, to } = bandEditChanged(edit, frames)
  return { from: Math.max(0, from - BAND_EDIT_FFT_SIZE), to: Math.min(frames, to + BAND_EDIT_FFT_SIZE) }
}

/** A raised cosine from 0 at 0 to 1 at `width`. */
const rise = (x: number, width: number) => (x >= width ? 1 : x <= 0 ? 0 : 0.5 - 0.5 * Math.cos((Math.PI * x) / width))

/**
 * What a band edit does, as weights: per frame of the range, how much of the change it takes (1 inside, easing to 0
 * over `feather.frames` at an edge inside the sample, as an `EdgeRamp` does); per bin, the change to its level, as a
 * factor of the bin added to it (band gain: `g − 1` inside the band, easing to 0 over `feather.octaves` at its edges;
 * keep band: `−1` outside the band, easing to 0 inside it).
 */
export const bandMask = (edit: BandEdit, frames: number, sampleRate: number) => {
  const { from, to } = bandEditChanged(edit, frames)
  const half = Math.floor((to - from) / 2)
  const feather = Math.max(0, Math.round(edit.feather.frames))
  const head = from > 0 ? Math.min(feather, half) : 0
  const tail = to < frames ? Math.min(feather, half) : 0
  const time = (frame: number): number => {
    const intoHead = frame - from
    const intoTail = to - 1 - frame
    let weight = 1
    if (intoHead < head) weight = Math.min(weight, (intoHead + 1) / (head + 1))
    if (intoTail < tail) weight = Math.min(weight, (intoTail + 1) / (tail + 1))
    return weight
  }
  const bins = BAND_EDIT_FFT_SIZE / 2 + 1
  const { low, high } = edit.band
  const octaves = edit.feather.octaves
  const inBand = new Float64Array(bins)
  for (let k = 0; k < bins; k++) {
    const hz = (k * sampleRate) / BAND_EDIT_FFT_SIZE
    if (hz < low || hz > high) continue
    const aboveLow = low > 0 ? Math.log2(hz / low) : Infinity
    const belowHigh = hz > 0 ? Math.log2(high / hz) : Infinity
    inBand[k] = Math.min(rise(aboveLow, octaves), rise(belowHigh, octaves))
  }
  const gain = edit.kind === 'band-gain' ? 10 ** (edit.db / 20) : 0
  const bin = Float64Array.from(inBand, (f) => (edit.kind === 'band-gain' ? (gain - 1) * f : -(1 - f)))
  return { from, to, time, bin }
}

/** The channel indexes an edit touches in a sample of `count` channels. */
const touchedChannels = (count: number, channels: EditChannels): number[] =>
  count < 2 || channels === 'both' ? Array.from({ length: count }, (_, index) => index) : [channels === 'left' ? 0 : 1]

/** Part of a sample's channels: frames from `offset` on, holding at least what a band edit reads (`bandEditReads`). */
export interface BandSlice {
  readonly channels: readonly Float32Array[]
  readonly offset: number
  /** The whole sample's length and rate. */
  readonly frames: number
  readonly sampleRate: number
}

/**
 * The frames of every channel over the edit's range (`bandEditChanged`) after it. Columns sit on a grid `HOP` apart from
 * the sample's frame 0, whatever the slice's offset, so a slice gives the same floats as the whole sample; the same
 * function runs in the spectrum worker, in its fallback and in `apply`.
 */
export const applyBandEdit = (slice: BandSlice, edit: BandEdit): Float32Array[] => {
  const mask = bandMask(edit, slice.frames, slice.sampleRate)
  const { from, to } = mask
  const length = to - from
  const touched = new Set(touchedChannels(slice.channels.length, edit.channels))
  const still = mask.bin.every((weight) => weight === 0)
  const stft = createStft({ size: BAND_EDIT_FFT_SIZE, hop: HOP, window: 'hann' })
  const half = BAND_EDIT_FFT_SIZE / 2
  // Every column whose window covers a frame of the range.
  const first = Math.floor((from - half) / HOP) + 1
  const last = Math.ceil((to + half) / HOP) - 1
  return slice.channels.map((channel, index) => {
    const out = channel.slice(from - slice.offset, to - slice.offset)
    if (!touched.has(index) || still || length === 0) return out
    const change = new Float64Array(length)
    for (let column = first; column <= last; column++) {
      const { re, im } = stft.spectrum(channel, column * HOP - slice.offset)
      for (let k = 0; k < stft.bins; k++) {
        re[k] = re[k]! * mask.bin[k]!
        im[k] = im[k]! * mask.bin[k]!
      }
      stft.overlapAdd(re, im, column * HOP - from, change)
    }
    for (let i = 0; i < length; i++) out[i] = out[i]! + mask.time(from + i) * change[i]!
    return out
  })
}

/** A copy of the audio with `frames` (one per channel) written from `at`. */
export const spliceFrames = (audio: SampleAudio, at: number, frames: readonly Float32Array[]): SampleAudio => ({
  sampleRate: audio.sampleRate,
  channels: audio.channels.map((channel, index) => {
    const copy = channel.slice()
    const part = frames[index]
    if (part) copy.set(part, at)
    return copy
  }),
})

/** A new `SampleAudio` with a band edit applied on this thread. */
export const applyBandEditTo = (audio: SampleAudio, edit: BandEdit): SampleAudio => {
  const frames = audio.channels[0]?.length ?? 0
  const reads = bandEditReads(edit, frames)
  const slice = { channels: audio.channels.map((channel) => channel.subarray(reads.from, reads.to)), offset: reads.from, frames, sampleRate: audio.sampleRate }
  return spliceFrames(audio, bandEditChanged(edit, frames).from, applyBandEdit(slice, edit))
}
