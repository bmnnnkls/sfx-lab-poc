import type { NodeShape, Patch } from '@core'

/**
 * What a card draws: the node's own ports, plus the parameter sockets that are wired (a wire needs somewhere to end)
 * or all of them while the **Sockets** toggle is on. Ports keep their order, so `portPosition` indexes this shape
 * and not the full one. The same object when nothing is hidden.
 */
export const visibleShape = (shape: NodeShape, nodeId: string, patch: Patch, showSockets: boolean): NodeShape => {
  if (showSockets || !shape.inputs.some((port) => port.param !== undefined)) return shape
  const inputs = shape.inputs.filter(
    (port) => port.param === undefined || patch.connections.some((c) => c.to.node === nodeId && c.to.port === port.id),
  )
  return inputs.length === shape.inputs.length ? shape : { ...shape, inputs }
}

/** The parameters of a node that a wire is driving: their stored value is ignored while the wire is there. */
export const drivenParams = (nodeId: string, shape: NodeShape, patch: Patch): ReadonlySet<string> =>
  new Set(
    patch.connections.flatMap((c) => {
      const param = c.to.node === nodeId ? shape.inputs.find((port) => port.id === c.to.port)?.param : undefined
      return param === undefined ? [] : [param]
    }),
  )
