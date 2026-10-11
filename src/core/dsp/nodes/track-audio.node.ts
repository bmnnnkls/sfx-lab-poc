import { Params } from '../params'
import { RIGHT, STEREO_FRAMES } from '../stereo'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

export const TRACK_AUDIO_TYPE = 'trackAudio'

/** Where a Track audio node takes the other track's sound from. */
const TAPS = ['before its effects', 'after its effects'] as const

const PARAMS: readonly ParamSpec[] = [{ id: 'tap', label: 'Take', min: 0, max: TAPS.length - 1, default: 1, step: 1, options: TAPS }]

/**
 * Another track's sound as a source in this graph, before or after that track's own effects (both before its fader, so a
 * track turned all the way down can still be taken). The mirror of Track notes: use it for a parallel chain, or to
 * modulate with another track (wire it into a Gain's CV). Silent with no track chosen, and in a graph that cannot see
 * other tracks.
 */
class TrackAudio implements DspNode {
  private readonly params = new Params(PARAMS)
  private trackId: string | null = null

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  setTrack(trackId: string | null): void {
    this.trackId = trackId
  }

  process({ frames, taps }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const source = this.trackId === null ? undefined : taps?.read(this.trackId, Math.round(this.params.get('tap')))
    if (source?.length !== STEREO_FRAMES) {
      out.fill(0)
      return
    }
    out.set(source.subarray(0, frames), 0)
    out.set(source.subarray(RIGHT, RIGHT + frames), RIGHT)
  }
}

export const trackAudioNode: NodeDefinition = {
  type: TRACK_AUDIO_TYPE,
  label: 'Track audio',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out', kind: 'stereo' }],
  params: PARAMS,
  insertOnly: true,
  usesTrack: 'audio',
  create: () => new TrackAudio(),
}
