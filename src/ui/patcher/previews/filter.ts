import { type Point, type Preview, type Values, MARGIN, PREVIEW_HEIGHT, PREVIEW_WIDTH, clamp, round } from './types'

const MODES = ['lowpass', 'highpass', 'bandpass'] as const
const SAMPLE_RATE = 48000
const LOW_HZ = 20
const HIGH_HZ = 20000
/** The picture shows this range of gain: a little above unity for a resonant peak, and well down for the stop band. */
export const TOP_DB = 18
export const BOTTOM_DB = -36

/** The same RBJ biquad the filter node runs, evaluated on the unit circle: the gain in dB at `hz`. */
export const responseDb = (mode: number, cutoff: number, q: number, hz: number): number => {
  const w0 = (2 * Math.PI * Math.min(cutoff, SAMPLE_RATE * 0.45)) / SAMPLE_RATE
  const cosW0 = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  let b0: number, b1: number, b2: number
  switch (MODES[mode]) {
    case 'highpass':
      b0 = (1 + cosW0) / 2
      b1 = -(1 + cosW0)
      b2 = b0
      break
    case 'bandpass':
      b0 = alpha
      b1 = 0
      b2 = -alpha
      break
    default:
      b0 = (1 - cosW0) / 2
      b1 = 1 - cosW0
      b2 = b0
  }
  const a1 = -2 * cosW0
  const a2 = 1 - alpha
  const w = (2 * Math.PI * hz) / SAMPLE_RATE
  const cos1 = Math.cos(w)
  const sin1 = Math.sin(w)
  const cos2 = Math.cos(2 * w)
  const sin2 = Math.sin(2 * w)
  const numRe = b0 + b1 * cos1 + b2 * cos2
  const numIm = -(b1 * sin1 + b2 * sin2)
  const denRe = a0 + a1 * cos1 + a2 * cos2
  const denIm = -(a1 * sin1 + a2 * sin2)
  const gain = Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm)
  return 20 * Math.log10(Math.max(gain, 1e-6))
}

/** The frequency response across 20 Hz to 20 kHz on a log axis, with a dim line at 0 dB. */
export const filterPreview = (values: Values): Preview => {
  const mode = Math.round(clamp(values.mode ?? 0, 0, MODES.length - 1))
  const cutoff = clamp(values.cutoff ?? 2000, LOW_HZ, HIGH_HZ)
  const q = clamp(values.resonance ?? 0.707, 0.1, 20)
  const top = MARGIN
  const bottom = PREVIEW_HEIGHT - MARGIN
  const y = (db: number) => round(bottom - ((clamp(db, BOTTOM_DB, TOP_DB) - BOTTOM_DB) / (TOP_DB - BOTTOM_DB)) * (bottom - top))
  const steps = 76
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const hz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (i / steps)
    points.push([round((i / steps) * PREVIEW_WIDTH), y(responseDb(mode, cutoff, q, hz))])
  }
  return {
    shapes: [
      { kind: 'line', points: [[0, y(0)], [PREVIEW_WIDTH, y(0)]], tone: 'dim' },
      { kind: 'line', points, tone: 'main' },
    ],
  }
}
