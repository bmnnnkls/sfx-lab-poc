import { Params } from '../params'
import { createRng, voiceSeed, voicesDiffer, voicesParam } from '../random'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const PARAMS: readonly ParamSpec[] = [
  { id: 'rate', label: 'Rate', min: 0, max: 5000, default: 20, step: 0.1, unit: '/s' },
  { id: 'decay', label: 'Decay', min: 0.05, max: 100, default: 2, unit: 'ms' },
  { id: 'spread', label: 'Spread', min: 0, max: 1, default: 0.7, step: 0.01 },
  { id: 'gate', label: 'Gate', min: 0.001, max: 1, default: 0.02, unit: 's' },
  { id: 'seed', label: 'Seed', min: 0, max: 9999, default: 1, step: 1, socket: false },
  voicesParam(0),
]

/**
 * Random clicks at random times, like a Geiger counter, vinyl dust or rain. Each sample has the chance `rate / sampleRate`
 * of being an event (a Poisson process: the gaps are irregular, the average is `rate` per second). An event is both a burst
 * of crackle on `Click` (noise that dies away over `decay`; its strength varies by `spread`) and a gate on `Trigger` that
 * stays high for `gate` seconds, to fire an envelope or a sampler. Seeded: the same seed is the same clicks (in a chord, each voice has its own unless `voices` is `same`).
 */
class Geiger implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly rng = createRng(1)
  private strength = 0
  private gateLeft = 0

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

  process({ frames, sampleRate }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [click, trigger]: readonly Float32Array[]): void {
    const chance = Math.min(1, this.params.get('rate') / sampleRate)
    const fall = Math.exp(-1 / (Math.max(0.05, this.params.get('decay')) * 0.001 * sampleRate))
    const spread = this.params.get('spread')
    const gateSamples = Math.max(1, Math.round(this.params.get('gate') * sampleRate))
    for (let i = 0; i < frames; i++) {
      if (this.rng.next() < chance) {
        // 1 at no spread; at full spread anywhere from nothing to 1.
        this.strength = 1 - spread * this.rng.next()
        this.gateLeft = gateSamples
      }
      if (click) click[i] = this.strength * (this.rng.next() * 2 - 1)
      this.strength *= fall
      if (trigger) trigger[i] = this.gateLeft > 0 ? 1 : 0
      if (this.gateLeft > 0) this.gateLeft--
    }
  }
}

export const geigerNode: NodeDefinition = {
  type: 'geiger',
  label: 'Geiger',
  inputs: [],
  outputs: [
    { id: 'click', label: 'Click' },
    { id: 'trigger', label: 'Trigger' },
  ],
  params: PARAMS,
  create: (_sampleRate, salt = 0) => new Geiger(salt),
}
