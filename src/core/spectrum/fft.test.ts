import { describe, expect, it } from 'vitest'
import { coherentGain, createFft, windowOf } from '.'

const noise = (length: number, seed: number) => {
  let state = seed
  return Float64Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 31 - 1
  })
}

/** The DFT by its definition, for bins 0 to size/2. */
const dft = (input: Float64Array) => {
  const size = input.length
  const re = new Float64Array(size / 2 + 1)
  const im = new Float64Array(size / 2 + 1)
  for (let k = 0; k <= size / 2; k++) {
    for (let n = 0; n < size; n++) {
      re[k] = re[k]! + input[n]! * Math.cos((2 * Math.PI * k * n) / size)
      im[k] = im[k]! - input[n]! * Math.sin((2 * Math.PI * k * n) / size)
    }
  }
  return { re, im }
}

const maxError = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let error = 0
  for (let i = 0; i < a.length; i++) error = Math.max(error, Math.abs(a[i]! - b[i]!))
  return error
}

describe('createFft', () => {
  it.each([4, 8, 64, 256])('matches the DFT at %i', (size) => {
    const input = noise(size, size)
    const fft = createFft(size)
    const re = new Float64Array(fft.bins)
    const im = new Float64Array(fft.bins)
    fft.forward(input, re, im)
    const expected = dft(input)
    expect(maxError(re, expected.re)).toBeLessThan(1e-9)
    expect(maxError(im, expected.im)).toBeLessThan(1e-9)
  })

  it.each([1024, 2048, 4096])('gives the input back from its spectrum within 1e-6 at %i', (size) => {
    const input = noise(size, 7)
    const fft = createFft(size)
    const re = new Float64Array(fft.bins)
    const im = new Float64Array(fft.bins)
    const output = new Float64Array(size)
    fft.forward(input, re, im)
    fft.inverse(re, im, output)
    expect(maxError(output, input)).toBeLessThan(1e-6)
  })

  it('puts a tone on a bin into that bin, and one between bins nearest the nearer one', () => {
    const size = 2048
    const fft = createFft(size)
    const re = new Float64Array(fft.bins)
    const im = new Float64Array(fft.bins)
    const loudest = (bin: number) => {
      fft.forward(Float64Array.from({ length: size }, (_, n) => Math.sin((2 * Math.PI * bin * n) / size)), re, im)
      let best = 0
      for (let k = 1; k < fft.bins; k++) if (Math.hypot(re[k]!, im[k]!) > Math.hypot(re[best]!, im[best]!)) best = k
      return best
    }
    expect(loudest(100)).toBe(100)
    expect(loudest(333)).toBe(333)
    expect(loudest(100.3)).toBe(100)
    expect(loudest(100.7)).toBe(101)
  })

  it('refuses a size that is not a power of two', () => {
    expect(() => createFft(1000)).toThrow()
    expect(() => createFft(2)).toThrow()
  })
})

describe('windowOf', () => {
  it.each(['hann', 'blackman-harris'] as const)('sums to its coherent gain times its size (%s)', (kind) => {
    for (const size of [1024, 2048]) {
      const sum = windowOf(kind, size).reduce((total, value) => total + value, 0)
      expect(sum / size).toBeCloseTo(coherentGain(kind), 12)
    }
  })

  it('is made once per kind and size', () => {
    expect(windowOf('hann', 512)).toBe(windowOf('hann', 512))
    expect(windowOf('hann', 512)[0]).toBeCloseTo(0, 12)
    expect(windowOf('hann', 512)[256]).toBeCloseTo(1, 12)
  })
})
