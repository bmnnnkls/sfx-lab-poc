import { type NodeShape, type PortKind, type PortSpec, kindsConnect } from '@core'

/**
 * Where a wire dropped on empty canvas goes into a node it makes: the first input that accepts what the wire carries,
 * preferring the node's own inputs to parameter sockets (a signal into a Filter lands on `In`, not on one of its settings).
 * Undefined when the node has nothing that fits, so it is not offered.
 */
export const targetInput = (shape: NodeShape, source: PortKind | undefined): PortSpec | undefined => {
  const fits = shape.inputs.filter((port) => kindsConnect(source, port.kind))
  return fits.find((port) => port.param === undefined) ?? fits[0]
}
