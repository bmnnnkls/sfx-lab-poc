import { createId } from '../shared'
import { isDownstream } from './graph'
import type { ModuleLibrary } from './module-types'
import { describeNode } from './node-shape'
import type { Patch, PatchNode, PortRef } from './types'

const defaultParams = (type: string): Record<string, number> => {
  const shape = describeNode({ id: '', type, x: 0, y: 0, params: {} })
  if (!shape) throw new Error(`Unknown node type: ${type}`)
  return Object.fromEntries(shape.params.map((spec) => [spec.id, spec.default]))
}

export const createNode = (type: string, x: number, y: number): PatchNode => ({
  id: createId('node'),
  type,
  x,
  y,
  params: defaultParams(type),
})

export const addNode = (patch: Patch, node: PatchNode): Patch => ({
  ...patch,
  nodes: [...patch.nodes, node],
})

export const removeNode = (patch: Patch, nodeId: string): Patch => ({
  nodes: patch.nodes.filter((node) => node.id !== nodeId),
  connections: patch.connections.filter(
    ({ from, to }) => from.node !== nodeId && to.node !== nodeId,
  ),
})

/** Points a sample-playing node at a library sample (or none). */
export const setNodeSample = (patch: Patch, nodeId: string, sampleId: string | null): Patch => ({
  ...patch,
  nodes: patch.nodes.map((node) => {
    if (node.id !== nodeId) return node
    const { sampleId: _previous, ...rest } = node
    return sampleId === null ? rest : { ...rest, sampleId }
  }),
})

/** Clears every node's reference to a sample (when it is removed from the library). */
export const clearSampleReferences = (patch: Patch, sampleId: string): Patch =>
  patch.nodes.some((node) => node.sampleId === sampleId)
    ? {
        ...patch,
        nodes: patch.nodes.map((node) => {
          if (node.sampleId !== sampleId) return node
          const { sampleId: _removed, ...rest } = node
          return rest
        }),
      }
    : patch

/** Points a `trackNotes` node at a track (or none). */
export const setNodeTrack = (patch: Patch, nodeId: string, trackId: string | null): Patch => ({
  ...patch,
  nodes: patch.nodes.map((node) => {
    if (node.id !== nodeId) return node
    const { trackId: _previous, ...rest } = node
    return trackId === null ? rest : { ...rest, trackId }
  }),
})

/** Clears every node's reference to a track (when it is removed from the project). */
export const clearTrackReferences = (patch: Patch, trackId: string): Patch =>
  patch.nodes.some((node) => node.trackId === trackId)
    ? {
        ...patch,
        nodes: patch.nodes.map((node) => {
          if (node.trackId !== trackId) return node
          const { trackId: _removed, ...rest } = node
          return rest
        }),
      }
    : patch

export const setNodeBypassed = (patch: Patch, nodeId: string, bypassed: boolean): Patch =>
  patch.nodes.some((node) => node.id === nodeId && (node.bypassed === true) !== bypassed)
    ? {
        ...patch,
        nodes: patch.nodes.map((node) => {
          if (node.id !== nodeId) return node
          const { bypassed: _previous, ...rest } = node
          return bypassed ? { ...rest, bypassed } : rest
        }),
      }
    : patch

export const moveNode = (patch: Patch, nodeId: string, x: number, y: number): Patch => ({
  ...patch,
  nodes: patch.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node)),
})

export const setNodeParam = (
  patch: Patch,
  nodeId: string,
  paramId: string,
  value: number,
): Patch => ({
  ...patch,
  nodes: patch.nodes.map((node) =>
    node.id === nodeId ? { ...node, params: { ...node.params, [paramId]: value } } : node,
  ),
})

const findPort = (patch: Patch, ref: PortRef, direction: 'inputs' | 'outputs', modules: ModuleLibrary) => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  return node && describeNode(node, modules)?.[direction].find((port) => port.id === ref.port)
}

/** An output port may feed any number of inputs; an input sums all of its sources. */
export const canConnect = (patch: Patch, from: PortRef, to: PortRef, modules: ModuleLibrary = []): boolean => {
  if (from.node === to.node) return false
  const source = findPort(patch, from, 'outputs', modules)
  const target = findPort(patch, to, 'inputs', modules)
  if (!source || !target) return false
  // Sound connects to sound and notes to notes, never across.
  if ((source.kind ?? 'signal') !== (target.kind ?? 'signal')) return false
  const duplicate = patch.connections.some(
    (c) =>
      c.from.node === from.node &&
      c.from.port === from.port &&
      c.to.node === to.node &&
      c.to.port === to.port,
  )
  return !duplicate && !isDownstream(patch, to.node, from.node)
}

export interface ConnectOptions {
  readonly id?: string
  /** Needed to connect to ports of module uses. */
  readonly modules?: ModuleLibrary
}

/** Adds a connection, or returns the patch unchanged when it is not allowed. */
export const connect = (patch: Patch, from: PortRef, to: PortRef, options: ConnectOptions = {}): Patch =>
  canConnect(patch, from, to, options.modules)
    ? { ...patch, connections: [...patch.connections, { id: options.id ?? createId('wire'), from, to }] }
    : patch

export const disconnect = (patch: Patch, connectionId: string): Patch => ({
  ...patch,
  connections: patch.connections.filter((connection) => connection.id !== connectionId),
})
