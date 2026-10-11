import { MASTER_IN_TYPE, TRACK_OUT_TYPE } from '../dsp'
import { addNode, connect, createNode } from './edit'
import type { Patch } from './types'

/** The master graph a project starts with: the final mix straight through, untouched. */
export const createDefaultMasterGraph = (): Patch => {
  const source = createNode(MASTER_IN_TYPE, 20, 40)
  const sink = createNode(TRACK_OUT_TYPE, 620, 40)
  return connect(
    addNode(addNode({ nodes: [], connections: [] }, source), sink),
    { node: source.id, port: 'out' },
    { node: sink.id, port: 'in' },
  )
}
