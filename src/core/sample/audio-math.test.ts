import { describe, expect, it } from 'vitest'
import { selectionLevels } from './audio-math'
import type { SampleAudio } from './types'

/** The same sums, the plain way: every frame of every listed channel. */
const bruteForce = (audio: SampleAudio, from: number, to: number, channels: readonly number[]) => {
  const peaks = channels.map((channel) => Math.max(0, ...Array.from(audio.channels[channel]!.slice(from, to), Math.abs)))
  const rmses = channels.map((channel) => Math.sqrt(Array.from(audio.channels[channel]!.slice(from, to)).reduce((sum, value) => sum + value * value, 0) / (to - from)))
  return { peak: Math.max(...peaks), rms: Math.max(...rmses) }
}

const audioOf = (...channels: number[][]): SampleAudio => ({ sampleRate: 48000, channels: channels.map((values) => Float32Array.from(values)) })
const noise = (length: number, level: number, seed: number) => Array.from({ length }, (_, i) => Math.sin(i * 12.9898 + seed) * level)

describe('selectionLevels', () => {
  it('is silence for silence and for an empty range', () => {
    expect(selectionLevels(audioOf(new Array(100).fill(0)), { from: 0, to: 100 }, 'both')).toEqual({ peak: 0, rms: 0 })
    expect(selectionLevels(audioOf(noise(100, 0.5, 1)), { from: 40, to: 40 }, 'both')).toEqual({ peak: 0, rms: 0 })
  })

  it('is full scale for a full-scale square', () => {
    const square = Array.from({ length: 64 }, (_, i) => (i % 8 < 4 ? 1 : -1))
    expect(selectionLevels(audioOf(square), { from: 0, to: 64 }, 'both')).toEqual({ peak: 1, rms: 1 })
  })

  it('takes the loudest of a stereo pair, or one channel of it, as a brute force does', () => {
    const audio = audioOf(noise(1000, 0.25, 1), noise(1000, 0.75, 2))
    const check = (from: number, to: number, channels: 'both' | 'left' | 'right', indexes: number[]) => {
      const levels = selectionLevels(audio, { from, to }, channels)
      const expected = bruteForce(audio, from, to, indexes)
      expect(levels.peak).toBe(expected.peak)
      expect(levels.rms).toBeCloseTo(expected.rms, 6)
    }
    check(0, 1000, 'both', [0, 1])
    check(100, 350, 'left', [0])
    check(100, 350, 'right', [1])
    expect(selectionLevels(audio, { from: 0, to: 1000 }, 'left').peak).toBeLessThan(0.26)
  })

  it('keeps a range inside the audio, in order', () => {
    const audio = audioOf(noise(100, 0.5, 3))
    expect(selectionLevels(audio, { from: 120, to: -20 }, 'both')).toEqual(selectionLevels(audio, { from: 0, to: 100 }, 'both'))
  })
})
