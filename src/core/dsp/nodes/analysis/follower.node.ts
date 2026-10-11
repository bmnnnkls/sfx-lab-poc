import { Params } from '../../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../../types'
import { FOLLOW_MODES, Follower, smoothingCoefficient } from './follower'

const PARAMS: readonly ParamSpec[] = [
  { id: 'mode', label: 'Mode', min: 0, max: FOLLOW_MODES.length - 1, default: 0, step: 1, options: FOLLOW_MODES },
  { id: 'attack', label: 'Attack', min: 0.1, max: 500, default: 5, unit: 'ms' },
  { id: 'release', label: 'Release', min: 1, max: 5000, default: 120, unit: 'ms' },
]

/** Listens to a sound and outputs how loud it is as a control: wire it to a cutoff for an auto-wah, to a gain for ducking, to an LED. */
class EnvelopeFollower implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly follower = new Follower()

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames, sampleRate }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const attack = smoothingCoefficient(this.params.get('attack'), sampleRate)
    const release = smoothingCoefficient(this.params.get('release'), sampleRate)
    const rms = Math.round(this.params.get('mode')) === 1
    for (let i = 0; i < frames; i++) out[i] = this.follower.next(input?.[i] ?? 0, attack, release, rms)
  }
}

export const followerNode: NodeDefinition = {
  type: 'follower',
  label: 'Envelope follower',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Level', kind: 'control' }],
  params: PARAMS,
  create: () => new EnvelopeFollower(),
}
