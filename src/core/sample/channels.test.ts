import { describe, expect, it } from 'vitest'
import { channelAt, frameCount, monoAt, toMono } from '.'

const noise = (length: number, seed: number) => {
  let state = seed
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 31 - 1
  })
}

describe('reading channels', () => {
  it('monoAt is toMono, bit for bit, for one and two channels', () => {
    for (const channels of [[noise(4096, 1)], [noise(4096, 2), noise(4096, 3)]]) {
      const mix = toMono(channels)
      const audio = { sampleRate: 48000, channels }
      for (let i = 0; i < mix.length; i++) expect(Object.is(monoAt(audio, i), mix[i])).toBe(true)
    }
  })

  it('reads 0 outside the sample, and a mono sample the same in both channels', () => {
    const mono = { sampleRate: 48000, channels: [Float32Array.of(0.5, -0.25)] }
    const stereo = { sampleRate: 48000, channels: [Float32Array.of(0.5, -0.25), Float32Array.of(0.1, 0.2)] }
    expect(frameCount(mono)).toBe(2)
    expect(frameCount({ sampleRate: 48000, channels: [] })).toBe(0)
    expect([monoAt(mono, -1), monoAt(mono, 2), monoAt(stereo, 5), channelAt(stereo, 1, 2)]).toEqual([0, 0, 0, 0])
    expect([channelAt(mono, 0, 1), channelAt(mono, 1, 1)]).toEqual([-0.25, -0.25])
    expect([channelAt(stereo, 0, 0), channelAt(stereo, 1, 0)]).toEqual([0.5, Math.fround(0.1)])
  })
})
