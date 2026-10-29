import { frameCount } from './channels'
import type { SampleAudio } from './types'

/**
 * The peak pyramid: what the wave editor draws a long sample from. Level 0 holds a min and a max per channel for every
 * `PYRAMID_BASE` frames; each next level halves the count, until a level has at most `PYRAMID_TOP` buckets. Nothing
 * outside this file reads the levels: drawing asks `columnsFor`, so the base and the step can change here alone.
 */

const PYRAMID_BASE = 64
const PYRAMID_TOP = 512
/** From this many pixels per frame on, each sample point is drawn as a dot. */
const DOTS_FROM_PX_PER_FRAME = 8

interface PeakLevel {
  /** Frames per bucket. */
  readonly size: number
  /** Per channel, one value per bucket. */
  readonly min: readonly Float32Array[]
  readonly max: readonly Float32Array[]
}

export interface PeakPyramid {
  readonly frames: number
  readonly levels: readonly PeakLevel[]
}

/** Level 0 from the audio, frames `from` up to `to` (whole buckets). */
const fillBase = (audio: SampleAudio, level: PeakLevel, fromBucket: number, toBucket: number) => {
  const frames = frameCount(audio)
  audio.channels.forEach((data, channel) => {
    const min = level.min[channel]!
    const max = level.max[channel]!
    for (let bucket = fromBucket; bucket < toBucket; bucket++) {
      const end = Math.min(frames, (bucket + 1) * PYRAMID_BASE)
      let low = Infinity
      let high = -Infinity
      for (let i = bucket * PYRAMID_BASE; i < end; i++) {
        const value = data[i]!
        if (value < low) low = value
        if (value > high) high = value
      }
      min[bucket] = low
      max[bucket] = high
    }
  })
}

/** A level from the one below it, buckets `from` up to `to`. */
const fillFrom = (below: PeakLevel, level: PeakLevel, fromBucket: number, toBucket: number) => {
  const count = below.min[0]?.length ?? 0
  level.min.forEach((min, channel) => {
    const max = level.max[channel]!
    const lowMin = below.min[channel]!
    const lowMax = below.max[channel]!
    for (let bucket = fromBucket; bucket < toBucket; bucket++) {
      const a = 2 * bucket
      const b = a + 1 < count ? a + 1 : a
      min[bucket] = Math.min(lowMin[a]!, lowMin[b]!)
      max[bucket] = Math.max(lowMax[a]!, lowMax[b]!)
    }
  })
}

const emptyLevels = (audio: SampleAudio): PeakLevel[] => {
  const levels: PeakLevel[] = []
  let size = PYRAMID_BASE
  let count = Math.ceil(frameCount(audio) / PYRAMID_BASE)
  for (;;) {
    levels.push({
      size,
      min: audio.channels.map(() => new Float32Array(count)),
      max: audio.channels.map(() => new Float32Array(count)),
    })
    if (count <= PYRAMID_TOP) return levels
    size *= 2
    count = Math.ceil(count / 2)
  }
}

/** Builds the pyramid of `audio` at once. */
export const buildPeakPyramid = (audio: SampleAudio): PeakPyramid => {
  const levels = emptyLevels(audio)
  fillBase(audio, levels[0]!, 0, levels[0]!.min[0]?.length ?? 0)
  for (let index = 1; index < levels.length; index++) fillFrom(levels[index - 1]!, levels[index]!, 0, levels[index]!.min[0]?.length ?? 0)
  return { frames: frameCount(audio), levels }
}

/** What the view shows: the first frame at the left edge, how many frames one pixel column covers, and how many columns. */
export interface WaveView {
  readonly startFrame: number
  readonly framesPerPixel: number
  readonly width: number
}

/**
 * What each pixel column shows, per channel, by the frames per pixel:
 * * `peaks` (64 and more): a min and a max per column, from the finest pyramid level whose bucket fits in a column;
 * * `frames` (1 to 64): a min and a max per column, read from the audio itself;
 * * `points` (under 1): the sample values themselves, from `firstFrame` on, to be joined by a line (and, with `dots`,
 *   drawn as dots).
 * A column outside the sample has NaN for both.
 */
export type WaveColumns =
  | { readonly kind: 'peaks' | 'frames'; readonly min: readonly Float32Array[]; readonly max: readonly Float32Array[] }
  | { readonly kind: 'points'; readonly firstFrame: number; readonly values: readonly Float32Array[]; readonly dots: boolean }

export type WaveDraw = WaveColumns['kind']

/** Which band a zoom draws from. */
export const waveDrawFor = (framesPerPixel: number): WaveDraw =>
  framesPerPixel >= PYRAMID_BASE ? 'peaks' : framesPerPixel >= 1 ? 'frames' : 'points'

export const columnsFor = (view: WaveView, pyramid: PeakPyramid, audio: SampleAudio): WaveColumns => {
  const { startFrame, framesPerPixel, width } = view
  const frames = pyramid.frames
  const kind = waveDrawFor(framesPerPixel)

  if (kind === 'points') {
    const firstFrame = Math.max(0, Math.floor(startFrame))
    const lastFrame = Math.min(frames, Math.ceil(startFrame + width * framesPerPixel) + 1)
    return {
      kind,
      firstFrame,
      values: audio.channels.map((channel) => channel.slice(firstFrame, Math.max(firstFrame, lastFrame))),
      dots: 1 / framesPerPixel >= DOTS_FROM_PX_PER_FRAME,
    }
  }

  const min = audio.channels.map(() => new Float32Array(width).fill(Number.NaN))
  const max = audio.channels.map(() => new Float32Array(width).fill(Number.NaN))
  let level: PeakLevel | null = null
  if (kind === 'peaks') for (const candidate of pyramid.levels) if (candidate.size <= framesPerPixel) level = candidate
  for (let x = 0; x < width; x++) {
    const from = Math.max(0, Math.floor(startFrame + x * framesPerPixel))
    const to = Math.min(frames, Math.max(from + 1, Math.floor(startFrame + (x + 1) * framesPerPixel)))
    if (from >= frames || to <= 0) continue
    audio.channels.forEach((data, channel) => {
      let low = Infinity
      let high = -Infinity
      if (level) {
        const lows = level.min[channel]!
        const highs = level.max[channel]!
        const last = Math.min(lows.length, Math.ceil(to / level.size))
        for (let bucket = Math.floor(from / level.size); bucket < last; bucket++) {
          if (lows[bucket]! < low) low = lows[bucket]!
          if (highs[bucket]! > high) high = highs[bucket]!
        }
      } else {
        for (let i = from; i < to; i++) {
          const value = data[i]!
          if (value < low) low = value
          if (value > high) high = value
        }
      }
      min[channel]![x] = low
      max[channel]![x] = high
    })
  }
  return { kind, min, max }
}
