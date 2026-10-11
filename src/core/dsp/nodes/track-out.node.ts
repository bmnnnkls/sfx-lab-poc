import type { DspNode, NodeDefinition } from '../types'

export const TRACK_OUT_TYPE = 'trackOut'

/** Where a track's insert graph ends: everything wired in is what the track sends on to the mix. */
class TrackOut implements DspNode {
  setParam(): void {}
  process(): void {}
}

export const trackOutNode: NodeDefinition = {
  type: TRACK_OUT_TYPE,
  label: 'Track out',
  inputs: [{ id: 'in', label: 'In', kind: 'stereo' }],
  outputs: [],
  params: [],
  sink: true,
  insertOnly: true,
  create: () => new TrackOut(),
}
