import { findNoteNode } from '../notefx'
import { paramOfPort } from '../dsp'
import { flattenPatch } from './flatten'
import type { ModuleLibrary } from './module-types'
import { resolveParams } from './resolve'
import type { Patch } from './types'

/**
 * A note graph as the engine plays it. Control and math nodes may sit in a note graph and drive a note node's parameters
 * through its sockets; the note engine knows nothing of them, so they are worked out here (they are constants, since nothing
 * in a note graph moves) and baked into the note nodes' parameters, and the control nodes and their wires are left out.
 * Modules are expanded first. The wiring the engine sees is then only note wiring, so turning a knob is a parameter
 * change (the running graph keeps its state), not a rewire.
 */
export const engineNoteGraph = (patch: Patch, modules: ModuleLibrary): Patch => {
  const flat = flattenPatch(patch, modules)
  const driven = flat.connections.some((connection) => paramOfPort(connection.to.port) !== undefined)
  const hasHelpers = flat.nodes.some((node) => findNoteNode(node.type) === undefined)
  if (!driven && !hasHelpers) return flat
  const kept = flat.nodes.filter((node) => findNoteNode(node.type) !== undefined)
  const ids = new Set(kept.map((node) => node.id))
  return {
    nodes: kept.map((node) => (driven ? { ...node, params: resolveParams(flat, node.id).values } : node)),
    connections: flat.connections.filter(
      (connection) => ids.has(connection.from.node) && ids.has(connection.to.node) && paramOfPort(connection.to.port) === undefined,
    ),
  }
}
