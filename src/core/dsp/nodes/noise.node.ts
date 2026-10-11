import { createRng, voiceSeed, voicesDiffer, voicesParam } from '../random'
import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const COLOURS = ['white', 'pink', 'brown'] as const

const PARAMS: readonly ParamSpec[] = [
  { id: 'colour', label: 'Colour', min: 0, max: COLOURS.length - 1, default: 0, step: 1, options: COLOURS },
  { id: 'level', label: 'Level', min: 0, max: 1, default: 0.5, step: 0.01 },
  // The same seed is the same noise, every time; a setting, not a signal.
  { id: 'seed', label: 'Seed', min: 0, max: 9999, default: 1, step: 1, socket: false },
  voicesParam(0),
]

/** Pink noise from the three filters peaks near 2.1 at a gain of 0.25 (measured over 20 million samples); this keeps it under 1. */
const PINK_GAIN = 0.11

/** How far the brown noise integrator leaks each sample: without it the random walk drifts off to the rails. */
const LEAK = 0.998

/** Brown noise is a random walk, so it is scaled down to rarely reach the rails (and is clamped when it does). */
const BROWN_GAIN = 1.2

/**
 * Noise with a spectrum: white (flat), pink (falls 3 dB per octave, like most natural sounds) or brown (falls 6 dB per
 * octave: a rumble). White is uniform in [-1, 1); the others are scaled to peak below 1 at full level, which makes them quieter than white. Seeded, so it is
 * the same noise every time. In a chord each voice makes its own noise (`voices` differ) unless asked to match (`same`).
 */
class Noise implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly rng = createRng(1)
  // Paul Kellet's economy pink filter: three one-pole filters summed with the white input.
  private b0 = 0
  private b1 = 0
  private b2 = 0
  private brown = 0

  constructor(private readonly salt: number) {
    this.reseed()
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
    if (id === 'seed' || id === 'voices') this.reseed()
  }

  private reseed(): void {
    this.rng.reseed(voiceSeed(this.params.get('seed'), this.salt, voicesDiffer(this.params.get('voices'))))
  }

  process({ frames }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const colour = Math.round(this.params.get('colour'))
    const level = this.params.get('level')
    for (let i = 0; i < frames; i++) {
      const white = this.rng.next() * 2 - 1
      let sample = white
      if (colour === 1) {
        this.b0 = 0.99765 * this.b0 + white * 0.099046
        this.b1 = 0.963 * this.b1 + white * 0.2965164
        this.b2 = 0.57 * this.b2 + white * 1.0526913
        sample = Math.max(-1, Math.min(1, (this.b0 + this.b1 + this.b2 + white * 0.1848) * PINK_GAIN))
      } else if (colour === 2) {
        this.brown = this.brown * LEAK + white * 0.02
        sample = Math.max(-1, Math.min(1, this.brown * BROWN_GAIN))
      }
      out[i] = sample * level
    }
  }
}

export const noiseNode: NodeDefinition = {
  type: 'noise',
  label: 'Noise',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  create: (_sampleRate, salt = 0) => new Noise(salt),
}
