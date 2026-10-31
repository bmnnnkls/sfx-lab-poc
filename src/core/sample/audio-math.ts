import type { FrameRange } from './remap'
import type { SampleAudio } from './types'

/** Averages any number of channels into one. */
export const toMono = (channels: readonly Float32Array[]): Float32Array => {
  const first = channels[0]
  if (!first) return new Float32Array(0)
  if (channels.length === 1) return Float32Array.from(first)

  const mono = new Float32Array(first.length)
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0)
  }
  for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) / channels.length
  return mono
}

/** Largest absolute value of any channel in each of `buckets` equal slices; for drawing waveform thumbnails. */
export const computePeaks = (channels: readonly Float32Array[], buckets: number): Float32Array => {
  const peaks = new Float32Array(buckets)
  const length = channels[0]?.length ?? 0
  if (length === 0) return peaks
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * length) / buckets)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * length) / buckets))
    let peak = 0
    for (const data of channels) for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0))
    peaks[bucket] = peak
  }
  return peaks
}

/** A range's loudness: its peak and RMS, linear (1 is full scale). */
export interface Levels {
  readonly peak: number
  readonly rms: number
}

/**
 * The peak and RMS of a range of the audio on some channels (`both`, or one of a stereo pair), each the loudest of the
 * channels. One pass per channel, summing in doubles; an empty range is silence.
 */
export const selectionLevels = (audio: SampleAudio, range: FrameRange, channels: 'both' | 'left' | 'right'): Levels => {
  let peak = 0
  let rms = 0
  const which = audio.channels.length < 2 || channels === 'both' ? audio.channels.map((_, index) => index) : [channels === 'left' ? 0 : 1]
  for (const index of which) {
    const data = audio.channels[index]!
    const start = Math.max(0, Math.min(data.length, Math.floor(Math.min(range.from, range.to))))
    const end = Math.max(start, Math.min(data.length, Math.ceil(Math.max(range.from, range.to))))
    let channelPeak = 0
    let squares = 0
    for (let i = start; i < end; i++) {
      const value = data[i]!
      squares += value * value
      const magnitude = value < 0 ? -value : value
      if (magnitude > channelPeak) channelPeak = magnitude
    }
    if (channelPeak > peak) peak = channelPeak
    if (end > start) rms = Math.max(rms, Math.sqrt(squares / (end - start)))
  }
  return { peak, rms }
}
