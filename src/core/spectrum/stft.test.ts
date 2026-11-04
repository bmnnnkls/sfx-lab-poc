import { describe, expect, it } from 'vitest'
import { SPECTRUM_DB_FLOOR, byteToDb, createStft, dbToByte } from '.'

const sine = (length: number, cyclesPerFrame: number, amplitude = 1) => Float32Array.from({ length }, (_, n) => amplitude * Math.sin(2 * Math.PI * cyclesPerFrame * n))

describe('createStft', () => {
  it('reads a full-scale sine on a bin at 0 dB there, and far below that away from it', () => {
    for (const window of ['hann', 'blackman-harris'] as const) {
      const stft = createStft({ size: 2048, hop: 512, window })
      const out = new Float64Array(stft.bins)
      stft.magnitudes(sine(8192, 200 / 2048), 4096, out)
      expect(out[200]).toBeCloseTo(0, 6)
      expect(out[400]).toBeLessThan(-90)
    }
  })

  it('reads half scale at −6 dB, and a sine between bins within the window’s scalloping', () => {
    const stft = createStft({ size: 2048, hop: 512, window: 'blackman-harris' })
    const out = new Float64Array(stft.bins)
    stft.magnitudes(sine(8192, 200 / 2048, 0.5), 4096, out)
    expect(out[200]).toBeCloseTo(20 * Math.log10(0.5), 6)
    stft.magnitudes(sine(8192, 200.5 / 2048), 4096, out)
    expect(out[200]).toBeLessThan(0)
    expect(out[200]).toBeGreaterThan(-1)
  })

  it('reads frames outside the channel as zero', () => {
    const stft = createStft({ size: 1024, hop: 256, window: 'hann' })
    const out = new Uint8Array(stft.bins)
    stft.bytes(sine(4096, 0.1), -2000, out)
    expect(out.every((byte) => byte === 0)).toBe(true)
    stft.bytes(sine(4096, 0.1), 4096 + 512, out)
    expect(out.every((byte) => byte === 0)).toBe(true)
  })

  it('gives the input back within 1e-6 through overlap-add with Hann at a quarter hop, away from the ends', () => {
    for (const size of [1024, 2048, 4096]) {
      const hop = size / 4
      const stft = createStft({ size, hop, window: 'hann' })
      const input = Float32Array.from({ length: 6 * size }, (_, n) => Math.sin(n * 0.031) * 0.6 + Math.sin(n * 0.77) * 0.3)
      const output = new Float64Array(input.length)
      for (let centre = -size; centre < input.length + size; centre += hop) {
        const { re, im } = stft.spectrum(input, centre)
        stft.overlapAdd(re, im, centre, output)
      }
      let error = 0
      for (let n = size; n < input.length - size; n++) error = Math.max(error, Math.abs(output[n]! - input[n]!))
      expect(error, `size ${size}`).toBeLessThan(1e-6)
    }
  })

  it('reuses its buffers: nothing is allocated per column', () => {
    const stft = createStft({ size: 1024, hop: 256, window: 'hann' })
    const channel = sine(4096, 0.01)
    const first = stft.spectrum(channel, 1000)
    const second = stft.spectrum(channel, 2000)
    expect(second.re).toBe(first.re)
    expect(second.im).toBe(first.im)
  })
})

describe('dbToByte', () => {
  it('maps the floor and quieter to 0, 0 dB and louder to 255, and back', () => {
    expect(dbToByte(SPECTRUM_DB_FLOOR)).toBe(0)
    expect(dbToByte(-Infinity)).toBe(0)
    expect(dbToByte(0)).toBe(255)
    expect(dbToByte(6)).toBe(255)
    expect(byteToDb(dbToByte(-60))).toBeCloseTo(-60, 0)
    expect(Math.abs(byteToDb(dbToByte(-33.3)) - -33.3)).toBeLessThanOrEqual(-SPECTRUM_DB_FLOOR / 255 / 2 + 1e-9)
  })
})
