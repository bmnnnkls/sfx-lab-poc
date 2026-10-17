/** RBJ cookbook filter modes, in the order the mode parameter offers them. */
export const FILTER_MODES = ['lowpass', 'highpass', 'bandpass', 'notch', 'peak', 'low shelf', 'high shelf', 'all-pass'] as const

export interface Coefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** RBJ cookbook biquad. `gainDb` moves peak and both shelves; the pass filters ignore it. */
export const designBiquad = (mode: number, cutoff: number, q: number, sampleRate: number, gainDb = 0): Coefficients => {
  const w0 = (2 * Math.PI * Math.min(cutoff, sampleRate * 0.45)) / sampleRate
  const cosW0 = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const A = 10 ** (gainDb / 40)
  const sqrtA = Math.sqrt(A)

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
  switch (FILTER_MODES[mode]) {
    case 'highpass':
      b0 = (1 + cosW0) / 2
      b1 = -(1 + cosW0)
      b2 = b0
      a0 = 1 + alpha
      a1 = -2 * cosW0
      a2 = 1 - alpha
      break
    case 'bandpass':
      b0 = alpha
      b1 = 0
      b2 = -alpha
      a0 = 1 + alpha
      a1 = -2 * cosW0
      a2 = 1 - alpha
      break
    case 'notch':
      b0 = 1
      b1 = -2 * cosW0
      b2 = 1
      a0 = 1 + alpha
      a1 = -2 * cosW0
      a2 = 1 - alpha
      break
    case 'peak':
      b0 = 1 + alpha * A
      b1 = -2 * cosW0
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * cosW0
      a2 = 1 - alpha / A
      break
    case 'low shelf':
      b0 = A * (A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha)
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0)
      b2 = A * (A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha)
      a0 = A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha
      a1 = -2 * (A - 1 + (A + 1) * cosW0)
      a2 = A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha
      break
    case 'high shelf':
      b0 = A * (A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha)
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0)
      b2 = A * (A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha)
      a0 = A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha
      a1 = 2 * (A - 1 - (A + 1) * cosW0)
      a2 = A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha
      break
    case 'all-pass':
      b0 = 1 - alpha
      b1 = -2 * cosW0
      b2 = 1 + alpha
      a0 = 1 + alpha
      a1 = -2 * cosW0
      a2 = 1 - alpha
      break
    default: // lowpass
      b0 = (1 - cosW0) / 2
      b1 = 1 - cosW0
      b2 = b0
      a0 = 1 + alpha
      a1 = -2 * cosW0
      a2 = 1 - alpha
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}
