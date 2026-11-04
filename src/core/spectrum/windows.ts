/** The analysis windows: Hann for resynthesis (it overlaps to a constant at a quarter hop), Blackman-Harris for looking. */
export type WindowKind = 'hann' | 'blackman-harris'

/** Each window as a sum of cosines: w(n) = a0 − a1·cos(2πn/N) + a2·cos(4πn/N) − a3·cos(6πn/N). */
const COSINES: Readonly<Record<WindowKind, readonly number[]>> = {
  hann: [0.5, 0.5],
  'blackman-harris': [0.35875, 0.48829, 0.14128, 0.01168],
}

/** A window's mean value (its sum over `size`): what a sine's peak is scaled by in its bin. */
export const coherentGain = (kind: WindowKind): number => COSINES[kind][0]!

const made = new Map<string, Float64Array>()

/** The periodic window of `kind` and `size`, made once and shared: callers must not write to it. */
export const windowOf = (kind: WindowKind, size: number): Float64Array => {
  const key = `${kind}:${size}`
  const known = made.get(key)
  if (known) return known
  const terms = COSINES[kind]
  const window = new Float64Array(size)
  for (let n = 0; n < size; n++) {
    let value = 0
    terms.forEach((a, index) => (value += (index % 2 === 0 ? a : -a) * Math.cos((2 * Math.PI * index * n) / size)))
    window[n] = value
  }
  made.set(key, window)
  return window
}
