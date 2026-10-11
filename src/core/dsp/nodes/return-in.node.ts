import { RIGHT, STEREO_FRAMES } from '../stereo'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'

export const RETURN_IN_TYPE = 'returnIn'

/** Where a return track's insert graph starts: everything the other tracks have sent to it, summed, in stereo. */
class ReturnIn implements DspNode {
  setParam(): void {}

  process({ frames, input }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const stereo = input?.length === STEREO_FRAMES
    for (let i = 0; i < frames; i++) {
      out[i] = input?.[i] ?? 0
      out[RIGHT + i] = (stereo ? input?.[RIGHT + i] : input?.[i]) ?? 0
    }
  }
}

export const returnInNode: NodeDefinition = {
  type: RETURN_IN_TYPE,
  label: 'Return in',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out', kind: 'stereo' }],
  params: [],
  insertOnly: true,
  create: () => new ReturnIn(),
}
