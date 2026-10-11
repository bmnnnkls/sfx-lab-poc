import { Params } from '../params'
import { RIGHT } from '../stereo'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const PARAMS: readonly ParamSpec[] = [{ id: 'pan', label: 'Pan', min: -1, max: 1, default: 0, step: 0.01 }]

/**
 * Places a mono signal in the stereo field with a constant-power law: the total power stays the same wherever it
 * sits, so it does not get louder or quieter as it moves. Centre is -3 dB in each channel.
 */
class Pan implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const angle = ((this.params.get('pan') + 1) * Math.PI) / 4
    const left = Math.cos(angle)
    const right = Math.sin(angle)
    for (let i = 0; i < frames; i++) {
      const x = input?.[i] ?? 0
      out[i] = x * left
      out[RIGHT + i] = x * right
    }
  }
}

export const panNode: NodeDefinition = {
  type: 'pan',
  label: 'Pan',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out', kind: 'stereo' }],
  params: PARAMS,
  insertOnly: true,
  create: () => new Pan(),
}
