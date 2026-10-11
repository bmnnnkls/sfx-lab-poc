import { findNodeDefinition } from '../dsp'
import { type Patch, topologicalOrder } from '../patch'
import { bufferKey } from './compile'

/**
 * `voice` nodes run once per sounding note; `shared` nodes run once on the sum of all voices; `global` nodes run once
 * per block for the whole instrument and are read by both (a knob's value is the same for every voice).
 */
export type Stage = 'voice' | 'shared' | 'global'

export interface StagePlan {
  readonly stages: ReadonlyMap<string, Stage>
  readonly globalOrder: readonly string[]
  readonly voiceOrder: readonly string[]
  readonly sharedOrder: readonly string[]
  /** Voice outputs that feed shared nodes (`bufferKey`s); summed across voices at the boundary. */
  readonly boundaries: readonly string[]
}

/**
 * A node is shared when its definition says so or anything upstream of it is shared.
 * That makes the split a clean cut: signals only ever flow from voices into the shared
 * stage, never back.
 *
 * Otherwise a node that may be global (a control, a math node) is global when everything wired into it is global too,
 * and a voice node when not. Global buffers are read-only seeds for the other two stages, not summed: a voice -> shared
 * boundary adds the voices up, so a control read across it would arrive as N times its value.
 */
export const planStages = (patch: Patch): StagePlan => {
  const order = topologicalOrder(patch)
  if (!order) throw new Error('Patch contains a cycle')

  const typeOf = new Map(patch.nodes.map((node) => [node.id, node.type]))
  const stages = new Map<string, Stage>()
  for (const id of order) {
    const definition = findNodeDefinition(typeOf.get(id) ?? '')
    const incoming = patch.connections.filter((connection) => connection.to.node === id)
    const inherited = incoming.some((connection) => stages.get(connection.from.node) === 'shared')
    if (definition?.shared === true || inherited) stages.set(id, 'shared')
    else if (definition?.global === true && incoming.every((connection) => stages.get(connection.from.node) === 'global')) {
      stages.set(id, 'global')
    } else stages.set(id, 'voice')
  }

  const boundaries = new Set<string>()
  for (const { from, to } of patch.connections) {
    if (stages.get(from.node) === 'voice' && stages.get(to.node) === 'shared') {
      boundaries.add(bufferKey(from.node, from.port))
    }
  }

  return {
    stages,
    globalOrder: order.filter((id) => stages.get(id) === 'global'),
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
