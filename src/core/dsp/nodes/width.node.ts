import { Params } from '../params'
import { RIGHT } from '../stereo'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const PARAMS: readonly ParamSpec[] = [{ id: 'width', label: 'Width', min: 0, max: 2, default: 1, step: 0.01 }]

/** Mid/side width: 0 is mono, 1 leaves the signal as it is, 2 doubles what is different between the channels. */
class Width implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const width = this.params.get('width')
    for (let i = 0; i < frames; i++) {
      const left = input?.[i] ?? 0
      const right = input?.[RIGHT + i] ?? 0
      const mid = (left + right) * 0.5
      const side = (left - right) * 0.5 * width
      out[i] = mid + side
      out[RIGHT + i] = mid - side
    }
  }
}

export const widthNode: NodeDefinition = {
  type: 'width',
  label: 'Width',
  inputs: [{ id: 'in', label: 'In', kind: 'stereo' }],
  outputs: [{ id: 'out', label: 'Out', kind: 'stereo' }],
  params: PARAMS,
  insertOnly: true,
  create: () => new Width(),
}
