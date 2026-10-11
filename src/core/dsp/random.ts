/**
 * Seeded randomness for nodes. A render must come out the same every time (exports, tests, a sound you want back), so nothing
 * here looks at the clock or `Math.random`. `seed` is a whole number the user sets; the same seed gives the same sequence.
 */

/** mulberry32: a small, fast generator with a 32-bit state. `next()` is in [0, 1). */
export interface Rng {
  next(): number
  /** Back to the start of the sequence of `seed`. */
  reseed(seed: number): void
}

const mix = (seed: number): number => {
  const whole = Number.isFinite(seed) ? Math.trunc(seed) : 0
  // Spread small seeds (0, 1, 2, ...) over the state so neighbours do not start alike.
  return Math.imul(whole ^ 0x9e3779b9, 0x85ebca6b) >>> 0 || 0x1234567
}

export const createRng = (seed: number): Rng => {
  let state = mix(seed)
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
    },
    reseed(next) {
      state = mix(next)
    },
  }
}

/** A value in [-1, 1) that depends only on the whole number `index` and the seed: the same lattice point always gives the same gradient. */
export const hashSigned = (index: number, seed: number): number => {
  let h = Math.imul(index | 0, 0x27d4eb2d) ^ Math.imul(mix(seed), 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 0x80000000 - 1
}
