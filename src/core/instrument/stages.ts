import { findNodeDefinition } from '../dsp'
import { type Patch, topologicalOrder } from '../patch'
import { bufferKey } from './compile'

/** `voice` nodes run once per sounding note; `shared` nodes run once on the sum of all voices. */
export type Stage = 'voice' | 'shared'

export interface StagePlan {
  readonly stages: ReadonlyMap<string, Stage>
  readonly voiceOrder: readonly string[]
  readonly sharedOrder: readonly string[]
  /** Voice outputs that feed shared nodes (`bufferKey`s); summed across voices at the boundary. */
  readonly boundaries: readonly string[]
}

/**
 * A node is shared when its definition says so or anything upstream of it is shared.
 * That makes the split a clean cut: signals only ever flow from voices into the shared
 * stage, never back.
 */
export const planStages = (patch: Patch): StagePlan => {
  const order = topologicalOrder(patch)
  if (!order) throw new Error('Patch contains a cycle')

  const typeOf = new Map(patch.nodes.map((node) => [node.id, node.type]))
  const stages = new Map<string, Stage>()
  for (const id of order) {
    const intrinsic = findNodeDefinition(typeOf.get(id) ?? '')?.shared === true
    const inherited = patch.connections.some(
      (connection) => connection.to.node === id && stages.get(connection.from.node) === 'shared',
    )
    stages.set(id, intrinsic || inherited ? 'shared' : 'voice')
  }

  const boundaries = new Set<string>()
  for (const { from, to } of patch.connections) {
    if (stages.get(from.node) === 'voice' && stages.get(to.node) === 'shared') {
      boundaries.add(bufferKey(from.node, from.port))
    }
  }

  return {
    stages,
    voiceOrder: order.filter((id) => stages.get(id) === 'voice'),
    sharedOrder: order.filter((id) => stages.get(id) === 'shared'),
    boundaries: [...boundaries],
  }
}

/** For display: which stage each node belongs to. Empty for an (invalid) cyclic patch. */
export const classifyStages = (patch: Patch): ReadonlyMap<string, Stage> => {
  try {
    return planStages(patch).stages
  } catch {
    return new Map()
  }
}
