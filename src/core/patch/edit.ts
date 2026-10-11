import { findNodeDefinition, requireNodeDefinition } from '../dsp'
import { createId } from '../shared'
import { isDownstream } from './graph'
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

const hasPort = (patch: Patch, ref: PortRef, direction: 'inputs' | 'outputs'): boolean => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  const definition = node && findNodeDefinition(node.type)
  return Boolean(definition?.[direction].some((port) => port.id === ref.port))
}

/** An output port may feed any number of inputs; an input sums all of its sources. */
export const canConnect = (patch: Patch, from: PortRef, to: PortRef): boolean => {
  if (from.node === to.node) return false
  if (!hasPort(patch, from, 'outputs') || !hasPort(patch, to, 'inputs')) return false
  const duplicate = patch.connections.some(
    (c) =>
      c.from.node === from.node &&
      c.from.port === from.port &&
      c.to.node === to.node &&
      c.to.port === to.port,
  )
  return !duplicate && !isDownstream(patch, to.node, from.node)
}

/** Adds a connection, or returns the patch unchanged when it is not allowed. */
export const connect = (
  patch: Patch,
  from: PortRef,
  to: PortRef,
  id: string = createId('wire'),
): Patch =>
  canConnect(patch, from, to)
    ? { ...patch, connections: [...patch.connections, { id, from, to }] }
    : patch

export const disconnect = (patch: Patch, connectionId: string): Patch => ({
  ...patch,
  connections: patch.connections.filter((connection) => connection.id !== connectionId),
})
