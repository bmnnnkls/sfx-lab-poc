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

const LOOP_BPM = 120
const LOOP_BEATS = 4

/** Mixes `part` into `into` starting at `startSeconds`. */
const mixIn = (into: Float32Array, part: Float32Array, startSeconds: number, level: number): void => {
  const offset = Math.round(startSeconds * SAMPLE_RATE)
  for (let i = 0; i < part.length && offset + i < into.length; i++) {
    into[offset + i] = (into[offset + i] ?? 0) + (part[i] ?? 0) * level
  }
}

/** A one-bar drum loop at 120 BPM: kick on 1 and 3, snare on 2 and 4, hats on every eighth. */
const drumLoop = (): Float32Array => {
  const secondsPerBeat = 60 / LOOP_BPM
  const loop = new Float32Array(Math.round(LOOP_BEATS * secondsPerBeat * SAMPLE_RATE))
  const [hitKick, hitSnare, hitHat] = [kick(), snare(), hat()]

  for (const beat of [0, 2]) mixIn(loop, hitKick, beat * secondsPerBeat, 0.9)
  for (const beat of [1, 3]) mixIn(loop, hitSnare, beat * secondsPerBeat, 0.7)
  for (let eighth = 0; eighth < LOOP_BEATS * 2; eighth++) mixIn(loop, hitHat, (eighth / 2) * secondsPerBeat, 0.35)

  // Keep clear of clipping where the hits stack up.
  const peak = loop.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  return loop.map((value) => (value / peak) * 0.9)
}

/** A plucked, pitched tone at C4 (261.63 Hz), useful for playing melodies with the sampler. */
const pluck = (): Float32Array =>
  render(1.2, (t) => {
    const f = 261.63
    const tone =
      Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-3 * t)
    return 0.6 * tone * Math.exp(-3.2 * t) * Math.min(1, t * 400)
  })

/**
 * Synthesised on demand, so samples and audio clips can be tried without any audio files: four one-shots
 * for the sampler, and a drum loop whose name carries its tempo ("120 BPM") so an audio clip knows its length.
 */
export const createDemoSamples = (): DemoSample[] =>
  [
    ['Demo Kick', kick()],
    ['Demo Snare', snare()],
    ['Demo Hat', hat()],
    ['Demo Pluck C4', pluck()],
    ['Demo Drum Loop 120 BPM', drumLoop()],
  ].map(([name, data]) => ({
    name: name as string,
    bytes: encodeWav(data as Float32Array, SAMPLE_RATE),
  }))

export const DEMO_SAMPLE_RATE = SAMPLE_RATE
