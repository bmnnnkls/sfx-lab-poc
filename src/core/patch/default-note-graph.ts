import { CLIP_NOTES_TYPE, NOTE_OUT_TYPE } from '../notefx'
import { addNode, connect, createNode } from './edit'
import type { Patch } from './types'

/** The note graph every instrument track starts with: the clip's notes straight to the instrument. */
export const createDefaultNoteGraph = (): Patch => {
  const source = createNode(CLIP_NOTES_TYPE, 20, 40)
  const sink = createNode(NOTE_OUT_TYPE, 620, 40)
  return connect(
    addNode(addNode({ nodes: [], connections: [] }, source), sink),
    { node: source.id, port: 'out' },
    { node: sink.id, port: 'in' },
  )
}
