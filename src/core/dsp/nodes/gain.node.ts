import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const PARAMS: readonly ParamSpec[] = [{ id: 'gain', label: 'Gain', min: 0, max: 2, default: 1 }]

/** Multiplies the signal by the Gain parameter and, when connected, the `cv` input. */
class Gain implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(
    { frames }: ProcessContext,
    [input, cv]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    const gain = this.params.get('gain')
    for (let i = 0; i < frames; i++) {
      out[i] = (input?.[i] ?? 0) * gain * (cv ? (cv[i] ?? 0) : 1)
    }
  }
}

export const gainNode: NodeDefinition = {
  type: 'gain',
  label: 'Gain',
  inputs: [
    { id: 'in', label: 'In' },
    { id: 'cv', label: 'CV', control: true },
  ],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  stereoCapable: true,
  create: () => new Gain(),
}
