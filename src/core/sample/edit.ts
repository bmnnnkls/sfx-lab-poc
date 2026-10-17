/**
 * Sample edits: pure transforms on decoded mono data, so the same edit is the same bytes
 * every time. The sample editor applies one of these and the result becomes a new library
 * sample (the original stays untouched).
 */

/** The peak after normalizing: just under full scale. */
const NORMALIZE_PEAK = 0.999
/** A peak under this (-100 dB) is silence: normalizing it would only raise the noise. */
const SILENT_PEAK = 1e-5

/** Scales the sample so its loudest point is just under full scale. Silence stays silent. */
export const normalizeSample = (mono: Float32Array): Float32Array => {
  let peak = 0
  for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i] ?? 0))
  if (peak < SILENT_PEAK) return Float32Array.from(mono)
  const gain = NORMALIZE_PEAK / peak
  return Float32Array.from(mono, (value) => value * gain)
}

/** Plays the sample backwards. */
export const reverseSample = (mono: Float32Array): Float32Array => Float32Array.from(mono).reverse()

const frames = (mono: Float32Array, fraction: number): number =>
  Math.max(0, Math.min(mono.length, Math.round(fraction * mono.length)))

/** Keeps only the [from, to) fraction of the sample (the selection). */
export const keepSampleRegion = (mono: Float32Array, from: number, to: number): Float32Array => {
  const a = frames(mono, Math.min(from, to))
  const b = frames(mono, Math.max(from, to))
  return mono.slice(a, b)
}

/** Removes the [from, to) fraction of the sample, joining the parts around it. */
export const deleteSampleRegion = (mono: Float32Array, from: number, to: number): Float32Array => {
  const a = frames(mono, Math.min(from, to))
  const b = frames(mono, Math.max(from, to))
  const next = new Float32Array(mono.length - (b - a))
  next.set(mono.subarray(0, a), 0)
  next.set(mono.subarray(b), a)
  return next
}

/** Fades in over the first `seconds` of the sample (sample-rate aware, capped at half the length). */
export const fadeIn = (mono: Float32Array, sampleRate: number, seconds: number): Float32Array => {
  const count = Math.max(1, Math.min(Math.floor(seconds * sampleRate), Math.floor(mono.length / 2)))
  return Float32Array.from(mono, (value, index) => (index >= count ? value : value * (index / count)))
}

/** Fades out over the last `seconds` of the sample, likewise. */
export const fadeOut = (mono: Float32Array, sampleRate: number, seconds: number): Float32Array => {
  const count = Math.max(1, Math.min(Math.floor(seconds * sampleRate), Math.floor(mono.length / 2)))
  return Float32Array.from(mono, (value, index) => {
    const fromEnd = mono.length - 1 - index
    return fromEnd >= count ? value : value * (fromEnd / count)
  })
}
