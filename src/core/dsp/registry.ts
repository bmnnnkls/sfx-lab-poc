import { delayNode } from './nodes/delay.node'
import { envelopeNode } from './nodes/envelope.node'
import { filterNode } from './nodes/filter.node'
import { gainNode } from './nodes/gain.node'
import { noteNode } from './nodes/note.node'
import { oscillatorNode } from './nodes/oscillator.node'
import { outputNode } from './nodes/output.node'
import { samplerNode } from './nodes/sampler.node'
import type { NodeDefinition } from './types'

export const nodeDefinitions: readonly NodeDefinition[] = [
  noteNode,
  oscillatorNode,
  samplerNode,
  envelopeNode,
  gainNode,
  filterNode,
  delayNode,
  outputNode,
]

const byType = new Map(nodeDefinitions.map((definition) => [definition.type, definition]))

export const findNodeDefinition = (type: string): NodeDefinition | undefined => byType.get(type)

export const requireNodeDefinition = (type: string): NodeDefinition => {
  const definition = byType.get(type)
  if (!definition) throw new Error(`Unknown node type: ${type}`)
  return definition
}
