import type { ModuleLibrary } from './module-types'
import { describeNode } from './node-shape'
import type { Patch } from './types'

/**
 * How each node is called wherever nodes are listed (cards, the property editor, the panel): the name the user gave it,
 * else its type's label, numbered when the patch has several of the kind ("Oscillator 2"), in the order of the patch
 * (not of the canvas, so dragging a node about does not renumber the others). Naming a node does not renumber the rest.
 */
export const nodeTitles = (patch: Patch, modules: ModuleLibrary): Map<string, string> => {
  const labels = patch.nodes.map((node) => [node, describeNode(node, modules)?.label ?? node.type] as const)
  const total = new Map<string, number>()
  for (const [, label] of labels) total.set(label, (total.get(label) ?? 0) + 1)
  const seen = new Map<string, number>()
  return new Map(
    labels.map(([node, label]) => {
      const index = (seen.get(label) ?? 0) + 1
      seen.set(label, index)
      const fallback = (total.get(label) ?? 1) > 1 ? `${label} ${index}` : label
      return [node.id, node.name ?? fallback] as const
    }),
  )
}
