import { TRACK_IN_TYPE, TRACK_OUT_TYPE } from '../dsp'
import { addNode, connect, createNode } from './edit'
import type { Patch } from './types'

/** The insert graph every track starts with: the track's sound straight through, untouched. */
export const createDefaultFxGraph = (): Patch => {
  const source = createNode(TRACK_IN_TYPE, 20, 40)
  const sink = createNode(TRACK_OUT_TYPE, 620, 40)
  return connect(
    addNode(addNode({ nodes: [], connections: [] }, source), sink),
    { node: source.id, port: 'out' },
    { node: sink.id, port: 'in' },
  )
}
