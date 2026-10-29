import { TRACK_IN_TYPE, TRACK_OUT_TYPE } from '../dsp'
import { addNode, connect, createNode, setNodeStereo } from './edit'
import type { Patch } from './types'

/** The insert graph every track starts with: the track's sound straight through, untouched. */
export const createDefaultFxGraph = (stereo = false): Patch => {
  const source = createNode(TRACK_IN_TYPE, 20, 40)
  const sink = createNode(TRACK_OUT_TYPE, 620, 40)
  const patch = connect(
    addNode(addNode({ nodes: [], connections: [] }, source), sink),
    { node: source.id, port: 'out' },
    { node: sink.id, port: 'in' },
  )
  return stereo ? setNodeStereo(patch, source.id, true) : patch
}

/**
 * Whether the graph's `Track in` runs in stereo, so the track hands it both channels of its audio. The one place the
 * audio track runtime asks; a track whose `Track in` is mono (every track saved before 11a) plays today's mono mix.
 */
export const trackInIsStereo = (patch: Patch): boolean =>
  patch.nodes.some((node) => node.type === TRACK_IN_TYPE && node.stereo === true)
