/**
 * A radix-2 FFT of real input: a complex FFT of half the size over the even and odd frames, then one pass that splits
 * the two halves' spectra apart. The tables are made once per size; `forward` and `inverse` write into buffers the
 * caller owns and allocate nothing.
 */
export interface Fft {
  readonly size: number
  /** `size / 2 + 1`: from 0 Hz to the Nyquist frequency. */
  readonly bins: number
  /** The spectrum of `input` (its first `size` values) into `re` and `im` (`bins` long each). */
  forward(input: ArrayLike<number>, re: Float64Array, im: Float64Array): void
  /** The real signal whose spectrum is `re` and `im`, into `output` (`size` long): `forward` undone. */
  inverse(re: Float64Array, im: Float64Array, output: Float64Array | Float32Array): void
}

const isPowerOfTwo = (value: number) => Number.isInteger(value) && value >= 4 && (value & (value - 1)) === 0

export const createFft = (size: number): Fft => {
  if (!isPowerOfTwo(size)) throw new Error(`FFT size must be a power of two of at least 4, not ${size}`)
  const half = size / 2
  const bins = half + 1
  // The half-size complex FFT's tables: the bit-reversed order, and cos and sin of 2πj/half.
  const reversed = new Uint32Array(half)
  for (let i = 0, bits = Math.log2(half); i < half; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    reversed[i] = r
  }
  const cos = new Float64Array(Math.max(1, half / 2))
  const sin = new Float64Array(Math.max(1, half / 2))
  for (let j = 0; j < half / 2; j++) {
    cos[j] = Math.cos((2 * Math.PI * j) / half)
    sin[j] = Math.sin((2 * Math.PI * j) / half)
  }
  // The split pass's twiddles: cos and sin of 2πk/size.
  const splitCos = new Float64Array(bins)
  const splitSin = new Float64Array(bins)
  for (let k = 0; k < bins; k++) {
    splitCos[k] = Math.cos((2 * Math.PI * k) / size)
    splitSin[k] = Math.sin((2 * Math.PI * k) / size)
  }
  const zr = new Float64Array(half)
  const zi = new Float64Array(half)

  /** The complex FFT of `zr`, `zi` in place; `sign` −1 forward, +1 inverse (unscaled). */
  const complex = (sign: number) => {
    for (let i = 0; i < half; i++) {
      const j = reversed[i]!
      if (j > i) {
        const r = zr[i]!
        zr[i] = zr[j]!
        zr[j] = r
        const m = zi[i]!
        zi[i] = zi[j]!
        zi[j] = m
      }
    }
    for (let span = 2; span <= half; span *= 2) {
      const step = half / span
      const middle = span / 2
      for (let start = 0; start < half; start += span) {
        for (let j = 0; j < middle; j++) {
          const wr = cos[j * step]!
          const wi = sign * sin[j * step]!
          const a = start + j
          const b = a + middle
          const br = zr[b]! * wr - zi[b]! * wi
          const bi = zr[b]! * wi + zi[b]! * wr
          zr[b] = zr[a]! - br
          zi[b] = zi[a]! - bi
          zr[a] = zr[a]! + br
          zi[a] = zi[a]! + bi
        }
      }
    }
  }

  return {
    size,
    bins,
    forward: (input, re, im) => {
      for (let k = 0; k < half; k++) {
        zr[k] = input[2 * k]!
        zi[k] = input[2 * k + 1]!
      }
      complex(-1)
      // X[k] = E[k] + e^(−2πik/size) O[k], where E and O are the even and odd frames' spectra, taken out of Z.
      for (let k = 0; k < bins; k++) {
        const a = k % half
        const b = (half - k) % half
        const ar = zr[a]!
        const ai = zi[a]!
        const br = zr[b]!
        const bi = -zi[b]!
        const er = (ar + br) / 2
        const ei = (ai + bi) / 2
        const or = (ai - bi) / 2
        const oi = -(ar - br) / 2
        const c = splitCos[k]!
        const s = splitSin[k]!
        re[k] = er + or * c + oi * s
        im[k] = ei + oi * c - or * s
      }
    },
    inverse: (re, im, output) => {
      // Z[k] = E[k] + i·O[k], with E and O taken back out of X; then the half-size inverse gives the frames in pairs.
      for (let k = 0; k < half; k++) {
        const xr = re[k]!
        const xi = im[k]!
        const yr = re[half - k]!
        const yi = -im[half - k]!
        const er = (xr + yr) / 2
        const ei = (xi + yi) / 2
        const dr = (xr - yr) / 2
        const di = (xi - yi) / 2
        const c = splitCos[k]!
        const s = splitSin[k]!
        const or = dr * c - di * s
        const oi = dr * s + di * c
        zr[k] = er - oi
        zi[k] = ei + or
      }
      complex(1)
      for (let k = 0; k < half; k++) {
        output[2 * k] = zr[k]! / half
        output[2 * k + 1] = zi[k]! / half
      }
    },
  }
}
