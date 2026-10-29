import { GROUP_IN_TYPE, MASTER_IN_TYPE, RETURN_IN_TYPE, TRACK_IN_TYPE, TRACK_OUT_TYPE } from '../dsp'
import { CLIP_NOTES_TYPE, NOTE_OUT_TYPE } from '../notefx'
import type { Patch, PatchConnection, PatchNode } from '../patch'
import { createId } from '../shared'
import { MAX_PATCH_NODES } from './edit'

/** Where a graph's sound or notes come in and go out. A graph has one of each, so they are never copied. */
const FIXED_ENDS = new Set([TRACK_IN_TYPE, TRACK_OUT_TYPE, CLIP_NOTES_TYPE, NOTE_OUT_TYPE, RETURN_IN_TYPE, MASTER_IN_TYPE, GROUP_IN_TYPE])

/** Copied nodes and the wires between them. */
export interface CopiedNodes {
  readonly nodes: readonly PatchNode[]
  readonly connections: readonly PatchConnection[]
}

/** The nodes of a patch with these ids, but not its fixed ends, and the wires that run between them. */
export const copyNodes = (patch: Patch, nodeIds: Iterable<string>): CopiedNodes => {
  const wanted = new Set(nodeIds)
  const nodes = patch.nodes.filter((node) => wanted.has(node.id) && !FIXED_ENDS.has(node.type))
  const kept = new Set(nodes.map((node) => node.id))
  return { nodes, connections: patch.connections.filter(({ from, to }) => kept.has(from.node) && kept.has(to.node)) }
}

/**
 * Adds copied nodes to a patch with fresh node and wire ids, the group's top-left corner at `at` and the nodes where
 * they were relative to each other. The same patch (and no ids) when there is nothing to paste or the patch would
 * have more than the file format's 200 nodes.
 */
export const pasteNodes = (patch: Patch, copied: CopiedNodes, at: { readonly x: number; readonly y: number }): { patch: Patch; nodeIds: readonly string[] } => {
  if (copied.nodes.length === 0 || patch.nodes.length + copied.nodes.length > MAX_PATCH_NODES) return { patch, nodeIds: [] }
  const left = Math.min(...copied.nodes.map((node) => node.x)), top = Math.min(...copied.nodes.map((node) => node.y))
  const ids = new Map(copied.nodes.map((node) => [node.id, createId('node')]))
  const nodes = copied.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, x: Math.max(0, Math.round(at.x + node.x - left)), y: Math.max(0, Math.round(at.y + node.y - top)) }))
  const connections = copied.connections.map((wire) => ({
    id: createId('wire'),
    from: { ...wire.from, node: ids.get(wire.from.node)! },
    to: { ...wire.to, node: ids.get(wire.to.node)! },
  }))
  return { patch: { nodes: [...patch.nodes, ...nodes], connections: [...patch.connections, ...connections] }, nodeIds: nodes.map((node) => node.id) }
}
