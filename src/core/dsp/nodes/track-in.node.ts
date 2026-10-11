import type { DspNode, NodeDefinition, ProcessContext } from '../types'

export const TRACK_IN_TYPE = 'trackIn'

/** Where a track's insert graph starts: the track's own sound, before its effects. Silent anywhere else. */
class TrackIn implements DspNode {
  setParam(): void {}

  process({ frames, input }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    for (let i = 0; i < frames; i++) out[i] = input?.[i] ?? 0
  }
}

export const trackInNode: NodeDefinition = {
  type: TRACK_IN_TYPE,
  label: 'Track in',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [],
  insertOnly: true,
  create: () => new TrackIn(),
}
