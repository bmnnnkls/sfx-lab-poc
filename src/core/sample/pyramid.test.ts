import { describe, expect, it } from 'vitest'
import { type PeakPyramid, type SampleAudio, buildPeakPyramid, columnsFor, waveDrawFor } from '.'

const noise = (length: number, seed: number) => {
  let state = seed
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 31 - 1
  })
}

/** 100,000 frames: level 0 has 1563 buckets of 64, then 782 of 128, then 391 of 256. */
const AUDIO: SampleAudio = { sampleRate: 48000, channels: [noise(100_000, 1), noise(100_000, 2)] }
const pyramid = buildPeakPyramid(AUDIO)

/** The brute-force min and max of frames `from` up to `to`. */
const range = (data: Float32Array, from: number, to: number) => {
  let min = Infinity
  let max = -Infinity
  for (let i = from; i < Math.min(to, data.length); i++) {
    min = Math.min(min, data[i]!)
    max = Math.max(max, data[i]!)
  }
  return { min, max }
}

describe('buildPeakPyramid', () => {
  it('halves each level until one has at most 512 buckets, and each bucket is the min and max of its frames', () => {
    const levels = (pyramid as PeakPyramid).levels
    expect(levels.map((level) => [level.size, level.min[0]!.length])).toEqual([[64, 1563], [128, 782], [256, 391]])
    for (const level of levels) {
      AUDIO.channels.forEach((data, channel) => {
        for (let bucket = 0; bucket < level.min[channel]!.length; bucket++) {
          const expected = range(data, bucket * level.size, (bucket + 1) * level.size)
          expect(level.min[channel]![bucket], `${level.size} ${bucket}`).toBe(expected.min)
          expect(level.max[channel]![bucket], `${level.size} ${bucket}`).toBe(expected.max)
        }
      })
    }
  })

  it('has one level for a short sample, and none of its buckets for an empty one', () => {
    expect(buildPeakPyramid({ sampleRate: 48000, channels: [noise(1000, 3)] }).levels).toHaveLength(1)
    expect(buildPeakPyramid({ sampleRate: 48000, channels: [new Float32Array(0)] }).levels[0]!.min[0]).toHaveLength(0)
  })
})

describe('columnsFor', () => {
  /** The brute-force column: its frames, widened to whole buckets of `size` frames when drawn from the pyramid. */
  const expectColumns = (startFrame: number, framesPerPixel: number, width: number, size: number) => {
    const columns = columnsFor({ startFrame, framesPerPixel, width }, pyramid, AUDIO)
    if (columns.kind === 'points') throw new Error('expected min and max')
    for (let x = 0; x < width; x++) {
      const from = Math.floor(startFrame + x * framesPerPixel)
      const to = Math.max(from + 1, Math.floor(startFrame + (x + 1) * framesPerPixel))
      AUDIO.channels.forEach((data, channel) => {
        const expected = range(data, Math.floor(from / size) * size, Math.ceil(to / size) * size)
        expect([columns.min[channel]![x], columns.max[channel]![x]], `column ${x}`).toEqual([expected.min, expected.max])
      })
    }
    return columns
  }

  it('picks its band by the frames per pixel', () => {
    expect([1000, 64, 63.9, 1, 0.99, 1 / 32].map(waveDrawFor)).toEqual(['peaks', 'peaks', 'frames', 'frames', 'points', 'points'])
  })

  it('draws from the finest level whose bucket fits in a column, on both sides of a level boundary', () => {
    expect(expectColumns(0, 64, 200, 64).kind).toBe('peaks')
    expect(expectColumns(1000, 127.5, 200, 64).kind).toBe('peaks')
    expect(expectColumns(1000, 128, 200, 128).kind).toBe('peaks')
    expect(expectColumns(333, 300, 300, 256).kind).toBe('peaks')
  })

  it('reads the audio itself between one and 64 frames per pixel', () => {
    expect(expectColumns(17, 1, 300, 1).kind).toBe('frames')
    expect(expectColumns(5000, 37.25, 300, 1).kind).toBe('frames')
  })

  it('gives the sample points under one frame per pixel, with dots from 8 px per frame', () => {
    const columns = columnsFor({ startFrame: 10.5, framesPerPixel: 1 / 4, width: 40 }, pyramid, AUDIO)
    if (columns.kind !== 'points') throw new Error('expected points')
    expect(columns.firstFrame).toBe(10)
    expect(Array.from(columns.values[1]!)).toEqual(Array.from(AUDIO.channels[1]!.slice(10, 22)))
    expect(columns.dots).toBe(false)
    const close = columnsFor({ startFrame: 0, framesPerPixel: 1 / 8, width: 40 }, pyramid, AUDIO)
    expect(close.kind === 'points' && close.dots).toBe(true)
  })

  it('leaves columns outside the sample empty', () => {
    const columns = columnsFor({ startFrame: 99_000, framesPerPixel: 100, width: 20 }, pyramid, AUDIO)
    if (columns.kind === 'points') throw new Error('expected min and max')
    expect(Number.isNaN(columns.min[0]![9])).toBe(false)
    expect(Number.isNaN(columns.min[0]![10])).toBe(true)
    expect(Number.isNaN(columns.max[1]![19])).toBe(true)
  })
})
