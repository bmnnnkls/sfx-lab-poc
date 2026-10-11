import { createId } from '../shared'
import { describeNode } from './node-shape'
import type { Patch, PatchNode } from './types'

/** One node of `noteGraphFrom`: its id, its type and the parameters that differ from the defaults. */
export interface NoteGraphNodeSpec {
  readonly id: string
  readonly type: string
  readonly params?: Readonly<Record<string, number>>
  readonly trackId?: string
  readonly bypassed?: boolean
}

/**
 * A note graph written down compactly: nodes by id, wires as `"from.port>to.port"`. Meant for tests and for
 * building starting graphs; positions are laid out left to right.
 */
export const noteGraphFrom = (nodes: readonly NoteGraphNodeSpec[], wires: readonly string[]): Patch => ({
  nodes: nodes.map((node, index): PatchNode => {
    const shape = describeNode({ id: node.id, type: node.type, x: 0, y: 0, params: {} })
    if (!shape) throw new Error(`Unknown node type: ${node.type}`)
    return {
      id: node.id,
      type: node.type,
      x: 20 + index * 200,
      y: 40,
      params: { ...Object.fromEntries(shape.params.map((spec) => [spec.id, spec.default])), ...node.params },
      ...(node.trackId === undefined ? {} : { trackId: node.trackId }),
      ...(node.bypassed ? { bypassed: true } : {}),
    }
  }),
  connections: wires.map((wire) => {
    const [from, to] = wire.split('>') as [string, string]
    const [fromNode, fromPort] = from.split('.') as [string, string]
    const [toNode, toPort] = to.split('.') as [string, string]
    return { id: createId('wire'), from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort } }
  }),
})
