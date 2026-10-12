/**
 * Seeded randomness for nodes. A render must come out the same every time (exports, tests, a sound you want back), so nothing
 * here looks at the clock or `Math.random`. `seed` is a whole number the user sets; the same seed gives the same sequence.
 */

import type { ParamSpec } from './types'

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

/** Apart from any seed a user can type (0 to 9999), and prime, so two voices never land on each other's seed. */
const VOICE_STRIDE = 10007

/**
 * The seed a voice really uses. In a chord every voice has its own copy of a seeded node; started from one seed they would
 * all make the same noise and add up coherently (louder, and phasey). `differ` moves each voice's seed by its slot in the voice
 * pool, so the voices are different noise; `same` keeps the seed as typed (every note alike). Slot 0, which is every node outside
 * a voice (global, shared, insert graphs), is the typed seed either way, so it sounds as it always did.
 */
export const voiceSeed = (seed: number, salt: number, differ: boolean): number =>
  differ && Number.isFinite(salt) ? seed + Math.max(0, Math.trunc(salt)) * VOICE_STRIDE : seed

/** The `voices` choice of a seeded source: index 0 is `differ`, 1 is `same`. `byDefault` is the index a new node starts with. */
export const voicesParam = (byDefault: 0 | 1): ParamSpec => ({
  id: 'voices',
  label: 'Voices',
  min: 0,
  max: 1,
  default: byDefault,
  step: 1,
  options: ['differ', 'same'],
})

/** Whether a `voices` parameter value asks for different noise in every voice. */
export const voicesDiffer = (value: number): boolean => Math.round(value) === 0
