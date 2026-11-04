import { describe, expect, it } from 'vitest'
import { nearestZeroCrossing, selectionLevels } from './audio-math'
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

describe('nearestZeroCrossing', () => {
  /** A sine of period 100 frames: it crosses at every multiple of 50. */
  const sine = (frames: number, phase = 0) => Float32Array.from({ length: frames }, (_, i) => Math.sin((2 * Math.PI * (i + phase)) / 100))
  const mono = (data: Float32Array): SampleAudio => ({ sampleRate: 1000, channels: [data] })

  it('finds the nearest crossing of a sine, either side, within the radius', () => {
    // Shifted a quarter frame, so no frame is exactly zero and each crossing is a change of sign.
    const audio = mono(sine(1000, 0.25))
    expect(nearestZeroCrossing(audio, 140, 'both', 20)).toBe(150)
    expect(nearestZeroCrossing(audio, 160, 'both', 20)).toBe(150)
    expect(nearestZeroCrossing(audio, 125, 'both', 20)).toBeNull()
  })

  it('takes the frame itself on silence, and the earlier of two at the same distance', () => {
    expect(nearestZeroCrossing(mono(new Float32Array(100)), 40, 'both', 5)).toBe(40)
    expect(nearestZeroCrossing(mono(Float32Array.from([1, 1, 0, 1, 1, 1, 0, 1])), 4, 'both', 2)).toBe(2)
  })

  it('reads the average of both channels, or one of them', () => {
    const left = Float32Array.from([1, 1, 1, -1, -1, -1])
    const right = Float32Array.from([1, -3, -3, -3, -3, -3])
    const audio: SampleAudio = { sampleRate: 1000, channels: [left, right] }
    expect(nearestZeroCrossing(audio, 4, 'both', 5)).toBe(1)
    expect(nearestZeroCrossing(audio, 4, 'left', 5)).toBe(3)
    expect(nearestZeroCrossing(audio, 4, 'right', 5)).toBe(1)
  })

  it('finds none in a constant signal, or in no audio', () => {
    expect(nearestZeroCrossing(mono(new Float32Array(50).fill(0.5)), 10, 'both', 100)).toBeNull()
    expect(nearestZeroCrossing(mono(new Float32Array(0)), 0, 'both', 10)).toBeNull()
  })
})
