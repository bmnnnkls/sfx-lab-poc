import { RIGHT } from '../stereo'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'

/** The explicit way back from stereo to mono: the average of the two channels. */
class MonoSum implements DspNode {
  setParam(): void {}

  process({ frames }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    for (let i = 0; i < frames; i++) out[i] = ((input?.[i] ?? 0) + (input?.[RIGHT + i] ?? 0)) * 0.5
  }
}

export const monoSumNode: NodeDefinition = {
  type: 'monoSum',
  label: 'Mono sum',
  inputs: [{ id: 'in', label: 'In', kind: 'stereo' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [],
  insertOnly: true,
  create: () => new MonoSum(),
}
