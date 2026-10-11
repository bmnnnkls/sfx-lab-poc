import { RIGHT, STEREO_FRAMES } from '../stereo'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'

export const RETURN_IN_TYPE = 'returnIn'
export const MASTER_IN_TYPE = 'masterIn'

/** A stereo source: the signal a graph was given to process (a mono one is heard in both channels). */
class StereoIn implements DspNode {
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

const stereoIn = (type: string, label: string): NodeDefinition => ({
  type,
  label,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out', kind: 'stereo' }],
  params: [],
  insertOnly: true,
  create: () => new StereoIn(),
})

/** Where a return track's insert graph starts: everything the other tracks have sent to it, summed. */
export const returnInNode = stereoIn(RETURN_IN_TYPE, 'Return in')

/** Where the master graph starts: the mix of all tracks and returns. */
export const masterInNode = stereoIn(MASTER_IN_TYPE, 'Master in')
