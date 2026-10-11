import { requireNodeDefinition } from '../dsp'
import { createId } from '../shared'
import { isDownstream } from './graph'
import type { ModuleLibrary } from './module-types'
import { describeNode } from './node-shape'
import type { Patch, PatchNode, PortRef } from './types'

const defaultParams = (type: string): Record<string, number> =>
  Object.fromEntries(requireNodeDefinition(type).params.map((spec) => [spec.id, spec.default]))

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

const hasPort = (
  patch: Patch,
  ref: PortRef,
  direction: 'inputs' | 'outputs',
  modules: ModuleLibrary,
): boolean => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  const shape = node && describeNode(node, modules)
  return Boolean(shape?.[direction].some((port) => port.id === ref.port))
}

/** An output port may feed any number of inputs; an input sums all of its sources. */
export const canConnect = (patch: Patch, from: PortRef, to: PortRef, modules: ModuleLibrary = []): boolean => {
  if (from.node === to.node) return false
  if (!hasPort(patch, from, 'outputs', modules) || !hasPort(patch, to, 'inputs', modules)) return false
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
