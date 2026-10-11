import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const PARAMS: readonly ParamSpec[] = [
  { id: 'attack', label: 'Attack', min: 0.001, max: 4, default: 0.01, unit: 's' },
  { id: 'decay', label: 'Decay', min: 0.001, max: 4, default: 0.15, unit: 's' },
  { id: 'sustain', label: 'Sustain', min: 0, max: 1, default: 0.6 },
  { id: 'release', label: 'Release', min: 0.001, max: 6, default: 0.25, unit: 's' },
]

type Stage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release'

/** Linear ADSR driven by a gate signal. Retriggers from the current level (no clicks). */
class Envelope implements DspNode {
  private readonly params = new Params(PARAMS)
  private stage: Stage = 'idle'
  private level = 0
  private gateWasOn = false

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [gateIn]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    const attackStep = 1 / (this.params.get('attack') * sampleRate)
    const decayStep = (1 - this.params.get('sustain')) / (this.params.get('decay') * sampleRate)
    const releaseStep = 1 / (this.params.get('release') * sampleRate)
    const sustain = this.params.get('sustain')

    for (let i = 0; i < frames; i++) {
      const gateOn = (gateIn?.[i] ?? 0) > 0.5
      if (gateOn && !this.gateWasOn) this.stage = 'attack'
      if (!gateOn && this.gateWasOn) this.stage = 'release'
      this.gateWasOn = gateOn

      switch (this.stage) {
        case 'attack':
          this.level += attackStep
          if (this.level >= 1) {
            this.level = 1
            this.stage = 'decay'
          }
          break
        case 'decay':
          this.level -= decayStep
          if (this.level <= sustain) {
            this.level = sustain
            this.stage = 'sustain'
          }
          break
        case 'sustain':
          this.level = sustain
          break
        case 'release':
          this.level -= releaseStep
          if (this.level <= 0) {
            this.level = 0
            this.stage = 'idle'
          }
          break
      }
      out[i] = this.level
    }
  }
}

export const envelopeNode: NodeDefinition = {
  type: 'envelope',
  label: 'Envelope',
  inputs: [{ id: 'gate', label: 'Gate' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  create: () => new Envelope(),
}
