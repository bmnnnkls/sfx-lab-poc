import { RIGHT, isStereoBuffer } from '../stereo'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'

export const TRACK_IN_TYPE = 'trackIn'

/**
 * Where a track's insert graph starts: the track's own sound, before its effects. Silent anywhere else.
 * In mono it reads a mono input as it is and a stereo one as the average of its channels; in stereo (one copy per
 * channel, told which by `setChannel`) each copy reads its channel, and a mono input is heard in both.
 */
class TrackIn implements DspNode {
  private channel: 0 | 1 | null = null

  setParam(): void {}

  setChannel(channel: 0 | 1): void {
    this.channel = channel
  }

  process({ frames, input }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    if (!input || !isStereoBuffer(input)) {
      for (let i = 0; i < frames; i++) out[i] = input?.[i] ?? 0
    } else if (this.channel === null) {
      for (let i = 0; i < frames; i++) out[i] = ((input[i] ?? 0) + (input[RIGHT + i] ?? 0)) / 2
    } else {
      const from = this.channel === 1 ? RIGHT : 0
      for (let i = 0; i < frames; i++) out[i] = input[from + i] ?? 0
    }
  }
}

export const trackInNode: NodeDefinition = {
  type: TRACK_IN_TYPE,
  label: 'Track in',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [],
  insertOnly: true,
  stereoCapable: true,
  create: () => new TrackIn(),
}
