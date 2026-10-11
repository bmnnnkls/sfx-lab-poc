import type { DspNode, NodeDefinition } from '../types'

/** Marker node: an instrument's audio is the sum of everything wired into its Output nodes. */
class Output implements DspNode {
  setParam(): void {}
  process(): void {}
}

export const OUTPUT_NODE_TYPE = 'output'

export const outputNode: NodeDefinition = {
  type: OUTPUT_NODE_TYPE,
  label: 'Output',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [],
  params: [],
  create: () => new Output(),
}
