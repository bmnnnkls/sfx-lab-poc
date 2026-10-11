import { Params } from '../../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../../types'
import { FOLLOW_MODES, Follower, smoothingCoefficient } from './follower'

/** The quietest level reported: below this a signal is silence (also the answer for 0, where a logarithm has none). */
export const FLOOR_DB = -120

const PARAMS: readonly ParamSpec[] = [
  { id: 'mode', label: 'Mode', min: 0, max: FOLLOW_MODES.length - 1, default: 1, step: 1, options: FOLLOW_MODES },
  { id: 'time', label: 'Time', min: 1, max: 2000, default: 100, unit: 'ms' },
]

/** 1 is 0 dB. Silence and anything below the floor give the floor. */
export const toDecibels = (level: number): number => (level > 1e-6 ? Math.max(FLOOR_DB, 20 * Math.log10(level)) : FLOOR_DB)

/** How loud a sound is in decibels (0 dB is full scale), averaged over Time: a level readout to look at, or to wire into a threshold. */
class LevelMeter implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly follower = new Follower()

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames, sampleRate }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const coefficient = smoothingCoefficient(this.params.get('time'), sampleRate)
    const rms = Math.round(this.params.get('mode')) === 1
    for (let i = 0; i < frames; i++) out[i] = toDecibels(this.follower.next(input?.[i] ?? 0, coefficient, coefficient, rms))
  }
}

export const levelNode: NodeDefinition = {
  type: 'level',
  label: 'Level (dB)',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'dB', kind: 'control' }],
  params: PARAMS,
  create: () => new LevelMeter(),
}
