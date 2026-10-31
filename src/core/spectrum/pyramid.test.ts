import { describe, expect, it } from 'vitest'
import { type SampleAudio, type SampleEdit, applySampleEdit, changedFrames, frameCount } from '../sample'
import {
  SPECTRUM_WINDOW,
  type SpectrumPyramid,
  buildSpectrumPyramid,
  columnsToFill,
  createSpectrumPyramid,
  createStft,
  fillSpectrum,
  framesRead,
  putSpectrumColumns,
  spectrumBytes,
  spectrumChunks,
  spectrumColumnBytes,
  spectrumColumnsFor,
  updateSpectrumPyramid,
} from '.'

const noise = (length: number, seed: number) => {
  let state = seed
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state / 2 ** 31 - 1) * 0.5
  })
}

/** 600,000 frames at FFT 1024 (hop 256): 2344 base columns, then 1172, 586, 293. */
const FFT = 1024
const AUDIO: SampleAudio = { sampleRate: 48000, channels: [noise(600_000, 1), noise(600_000, 2)] }
const pyramid = buildSpectrumPyramid(AUDIO, FFT)

const column = (p: SpectrumPyramid, level: number, channel: number, index: number) => p.levels[level]!.data[channel]!.subarray(index * p.bins, (index + 1) * p.bins)

const expectEqual = (a: SpectrumPyramid, b: SpectrumPyramid) => {
  expect(a.levels.length).toBe(b.levels.length)
  a.levels.forEach((level, index) => {
    const other = b.levels[index]!
    expect(level.count, `level ${index}`).toBe(other.count)
    expect(Buffer.from(level.filled).equals(Buffer.from(other.filled)), `filled ${index}`).toBe(true)
    level.data.forEach((data, channel) => expect(Buffer.from(data).equals(Buffer.from(other.data[channel]!)), `level ${index} channel ${channel}`).toBe(true))
  })
}

describe('buildSpectrumPyramid', () => {
  it('halves each level until one has at most 512 columns, and each column is the loudest of its base columns per bin', () => {
    expect(pyramid.levels.map((level) => [level.hop, level.count])).toEqual([[256, 2344], [512, 1172], [1024, 586], [2048, 293]])
    const stft = createStft({ size: FFT, hop: 256, window: SPECTRUM_WINDOW })
    const bytes = new Uint8Array(pyramid.bins)
    for (const index of [0, 1, 777, 2343]) {
      stft.bytes(AUDIO.channels[1]!, index * 256 + 128, bytes)
      expect(Buffer.from(column(pyramid, 0, 1, index)).equals(Buffer.from(bytes)), `base ${index}`).toBe(true)
    }
    for (let level = 1; level < pyramid.levels.length; level++) {
      const { span, count } = pyramid.levels[level]!
      for (const index of [0, 5, count - 1]) {
        for (let bin = 0; bin < pyramid.bins; bin += 37) {
          let loudest = 0
          for (let base = index * span; base < Math.min(pyramid.levels[0]!.count, (index + 1) * span); base++) loudest = Math.max(loudest, column(pyramid, 0, 0, base)[bin]!)
          expect(column(pyramid, level, 0, index)[bin], `level ${level} column ${index} bin ${bin}`).toBe(loudest)
        }
      }
    }
    expect(pyramid.levels.every((level) => level.filled.every((flag) => flag === 1))).toBe(true)
  })

  it('takes about the same bytes at every FFT size, and about 46 MB for 120 s of stereo at 48 kHz', () => {
    const frames = 120 * 48000
    // Within the top level's rounding: the levels stop at 512 columns or fewer.
    for (const size of [1024, 4096]) expect(Math.abs(spectrumBytes(frames, 2, size) / spectrumBytes(frames, 2, 2048) - 1)).toBeLessThan(0.03)
    expect(spectrumBytes(frames, 2, 2048) / 1e6).toBeGreaterThan(45)
    expect(spectrumBytes(frames, 2, 2048) / 1e6).toBeLessThan(47)
  })

  it('has one level for a short sample, and no columns for an empty one', () => {
    expect(buildSpectrumPyramid({ sampleRate: 48000, channels: [noise(5000, 3)] }, 2048).levels).toHaveLength(1)
    expect(buildSpectrumPyramid({ sampleRate: 48000, channels: [new Float32Array(0)] }, 2048).levels[0]!.count).toBe(0)
  })
})

describe('fillSpectrum', () => {
  it('in chunks, in any order, gives the same pyramid as a build', () => {
    const parts = createSpectrumPyramid(600_000, 2, FFT, 48000)
    const chunks = spectrumChunks(parts, { from: 300_000, to: 340_000 }, 100)
    expect(chunks[0]!.from).toBeLessThanOrEqual(Math.floor(300_000 / 256))
    for (const { from, to } of chunks) fillSpectrum(parts, AUDIO, from, to)
    expectEqual(parts, pyramid)
  })

  it('takes a worker’s chunks, computed from a slice of the channel, as its own', () => {
    const parts = createSpectrumPyramid(600_000, 2, FFT, 48000)
    for (const { from, to } of spectrumChunks(parts)) {
      const read = framesRead(parts, from, to)
      putSpectrumColumns(parts, from, to, AUDIO.channels.map((channel) => spectrumColumnBytes(FFT, channel.slice(read.from, read.to), from, to, read.from)))
    }
    expectEqual(parts, pyramid)
  })
})

describe('updateSpectrumPyramid', () => {
  const after = (edit: SampleEdit) => {
    const audio = applySampleEdit(AUDIO, edit)
    const changed = changedFrames(edit, frameCount(AUDIO))
    const updated = updateSpectrumPyramid(pyramid, audio, changed)
    const toFill = columnsToFill(updated)
    for (const { from, to } of toFill) fillSpectrum(updated, audio, from, to)
    expectEqual(updated, buildSpectrumPyramid(audio, FFT))
    return { changed, toFill }
  }

  it('after a same-length edit, fills only the columns whose windows touch the change', () => {
    const { changed, toFill } = after({ kind: 'gain', range: { from: 200_000, to: 210_000 }, channels: 'both', db: -6, ramp: { frames: 0, curve: 'linear' } })
    expect(toFill).toHaveLength(1)
    const read = framesRead(pyramid, toFill[0]!.from, toFill[0]!.to)
    expect(read.from).toBeLessThan(changed.from)
    expect(read.to).toBeGreaterThan(changed.to)
    // One column fewer on either side would leave a window that touches the change.
    expect(framesRead(pyramid, toFill[0]!.from + 1, toFill[0]!.to - 1).from).toBeGreaterThanOrEqual(changed.from - FFT)
    expect(toFill[0]!.to - toFill[0]!.from).toBeLessThan(10_000 / 256 + FFT / 256 + 2)
  })

  it('after a length-changing edit, fills everything from the change on', () => {
    const { changed, toFill } = after({ kind: 'delete', range: { from: 100_000, to: 150_000 }, crossfade: { frames: 0, curve: 'linear' } })
    expect(toFill).toHaveLength(1)
    expect(framesRead(pyramid, toFill[0]!.from, toFill[0]!.to).from).toBeLessThan(changed.from)
    expect(toFill[0]!.to).toBe(Math.ceil(550_000 / 256))
  })
})

describe('spectrumColumnsFor', () => {
  const view = (framesPerPixel: number, startFrame = 0, width = 200) => ({ startFrame, framesPerPixel, width })

  it('draws from the finest level whose column fits a pixel, over the columns the pixel covers', () => {
    for (const [framesPerPixel, level] of [[256, 0], [300, 0], [512, 1], [1500, 2], [4096, 3], [9000, 3]] as const) {
      const columns = spectrumColumnsFor(view(framesPerPixel, 1000), pyramid)
      expect(columns.kind).toBe('levels')
      expect(columns.data, `${framesPerPixel}`).toBe(pyramid.levels[level]!.data)
      const hop = pyramid.levels[level]!.hop
      expect(columns.from[3]).toBe(Math.floor((1000 + 3 * framesPerPixel) / hop))
      expect(columns.to[3]).toBe(Math.max(columns.from[3]! + 1, Math.ceil((1000 + 4 * framesPerPixel) / hop)))
      expect(columns.pending).toBe(false)
    }
  })

  it('stretches the base columns under a hop a pixel', () => {
    const columns = spectrumColumnsFor(view(10, 5000), pyramid)
    expect(columns.kind).toBe('stretched')
    expect(columns.data).toBe(pyramid.levels[0]!.data)
    expect(columns.from[0]).toBe(Math.floor(5005 / 256))
    expect(columns.to[0]! - columns.from[0]!).toBe(1)
    expect(columns.from[30]).toBe(Math.floor(5305 / 256))
  })

  it('draws nothing outside the sample, and is pending over columns not filled', () => {
    const columns = spectrumColumnsFor(view(1000, 590_000, 50), pyramid)
    expect(columns.to[5]! > columns.from[5]!).toBe(true)
    expect(columns.to[20]).toBe(columns.from[20])
    const empty = createSpectrumPyramid(600_000, 2, FFT, 48000)
    expect(spectrumColumnsFor(view(1000), empty).pending).toBe(true)
    fillSpectrum(empty, AUDIO, 0, Math.ceil(200_000 / 256) + 4)
    expect(spectrumColumnsFor(view(1000), empty).pending).toBe(false)
    expect(spectrumColumnsFor(view(1000, 300_000), empty).pending).toBe(true)
  })
})
