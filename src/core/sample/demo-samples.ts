import { encodeWav } from './wav'

const SAMPLE_RATE = 44100

export interface DemoSample {
  readonly name: string
  readonly bytes: Uint8Array
}

/** Small deterministic PRNG so generated samples are byte-identical every time (stable ids). */
const noiseSource = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 31 - 1
  }
}

const render = (seconds: number, voice: (t: number, i: number) => number): Float32Array =>
  Float32Array.from({ length: Math.round(seconds * SAMPLE_RATE) }, (_, i) => voice(i / SAMPLE_RATE, i))

const kick = (): Float32Array =>
  render(0.45, (t) => {
    // Pitch drops from ~150 Hz to ~45 Hz; integrate the frequency to get the phase.
    const phase = 2 * Math.PI * (45 * t + (105 / 30) * (1 - Math.exp(-30 * t)))
    return Math.sin(phase) * Math.exp(-7 * t)
  })

const snare = (): Float32Array => {
  const noise = noiseSource(7)
  return render(0.3, (t) => {
    const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-25 * t)
    return 0.5 * body + 0.7 * noise() * Math.exp(-16 * t)
  })
}

const hat = (): Float32Array => {
  const noise = noiseSource(99)
  let previous = 0
  return render(0.12, (t) => {
    const sample = noise()
    const highpassed = sample - previous // crude high-pass keeps it bright and thin
    previous = sample
    return 0.6 * highpassed * Math.exp(-45 * t)
  })
}

/** A plucked, pitched tone at C4 (261.63 Hz), useful for playing melodies with the sampler. */
const pluck = (): Float32Array =>
  render(1.2, (t) => {
    const f = 261.63
    const tone =
      Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-3 * t)
    return 0.6 * tone * Math.exp(-3.2 * t) * Math.min(1, t * 400)
  })

/** Four one-shots, synthesised on demand, so the sampler can be tried without any audio files. */
export const createDemoSamples = (): DemoSample[] =>
  [
    ['Demo Kick', kick()],
    ['Demo Snare', snare()],
    ['Demo Hat', hat()],
    ['Demo Pluck C4', pluck()],
  ].map(([name, data]) => ({
    name: name as string,
    bytes: encodeWav(data as Float32Array, SAMPLE_RATE),
  }))

export const DEMO_SAMPLE_RATE = SAMPLE_RATE
