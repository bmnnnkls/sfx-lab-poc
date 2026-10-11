/**
 * Pitch detection by the YIN method: how well does the sound match itself shifted by a lag? A pitched sound matches at a lag of
 * one period. Works on a block of samples at a modest rate (the node decimates to about 12 kHz first). Pure, so it is tested alone.
 */
export interface PitchEstimate {
  /** In Hz, or 0 when nothing pitched was found. */
  readonly frequency: number
  /** 0 (noise, silence) to 1 (a pure periodic sound). */
  readonly confidence: number
}

const NONE: PitchEstimate = { frequency: 0, confidence: 0 }

/** A dip in the difference function below this counts as a period (0.15 is the paper's suggestion). */
const DIP = 0.15

/** Silence: there is nothing to compare, and dividing by it would only make noise. */
const MIN_ENERGY = 1e-8

export const estimatePitch = (samples: Float32Array, sampleRate: number, lowHz: number, highHz: number): PitchEstimate => {
  const lagMax = Math.min(Math.floor(samples.length / 2) - 1, Math.floor(sampleRate / Math.max(1, lowHz)))
  const lagMin = Math.max(2, Math.floor(sampleRate / Math.max(lowHz + 1, highHz)))
  if (lagMax <= lagMin) return NONE
  const window = Math.floor(samples.length / 2)

  let energy = 0
  for (let i = 0; i < window; i++) energy += (samples[i] ?? 0) ** 2
  if (energy / window < MIN_ENERGY) return NONE

  // Difference function, then its cumulative-mean normalisation (which removes the trivial dip at lag 0).
  const normalised = new Float32Array(lagMax + 1)
  normalised[0] = 1
  let running = 0
  for (let lag = 1; lag <= lagMax; lag++) {
    let difference = 0
    for (let i = 0; i < window; i++) {
      const delta = (samples[i] ?? 0) - (samples[i + lag] ?? 0)
      difference += delta * delta
    }
    running += difference
    normalised[lag] = running === 0 ? 1 : (difference * lag) / running
  }

  // The first lag below the dip that is a local minimum; failing that, the deepest of all (with low confidence).
  let best = -1
  for (let lag = lagMin; lag <= lagMax; lag++) {
    if ((normalised[lag] ?? 1) < DIP) {
      while (lag + 1 <= lagMax && (normalised[lag + 1] ?? 1) < (normalised[lag] ?? 1)) lag++
      best = lag
      break
    }
  }
  if (best < 0) {
    let deepest = 1
    for (let lag = lagMin; lag <= lagMax; lag++) {
      if ((normalised[lag] ?? 1) < deepest) {
        deepest = normalised[lag] ?? 1
        best = lag
      }
    }
    if (best < 0) return NONE
  }

  // Parabolic interpolation around the dip for a period between whole samples.
  const [before, here, after] = [normalised[best - 1] ?? normalised[best] ?? 1, normalised[best] ?? 1, normalised[best + 1] ?? normalised[best] ?? 1]
  const curve = before - 2 * here + after
  const shift = curve === 0 ? 0 : Math.max(-1, Math.min(1, (before - after) / (2 * curve)))
  const period = best + shift
  const frequency = sampleRate / period
  if (!Number.isFinite(frequency) || frequency < lowHz * 0.9 || frequency > highHz * 1.1) return NONE
  return { frequency, confidence: Math.max(0, Math.min(1, 1 - here)) }
}
