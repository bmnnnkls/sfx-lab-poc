import { type DspNode, type ProcessContext, requireNodeDefinition } from '../dsp'
import type { Patch } from '../patch'

export const MAX_BLOCK_FRAMES = 128

export interface CompiledNode {
  readonly id: string
  readonly dsp: DspNode
  /** Resolved input buffers, in definition order; null when unconnected. */
  readonly inputs: ReadonlyArray<Float32Array | null>
  readonly outputs: readonly Float32Array[]
  /** Source buffers that must be summed into a node's own input buffer before processing. */
  readonly sums: ReadonlyArray<{ target: Float32Array; sources: readonly Float32Array[] }>
}

/** One runnable slice of a patch (all voice nodes, or all shared nodes). */
export interface CompiledStage {
  /** Nodes in execution order. */
  readonly nodes: readonly CompiledNode[]
  /** Every output buffer by `bufferKey`, including any seeded from another stage. */
  readonly outputBuffers: ReadonlyMap<string, Float32Array>
  /** Buffers feeding this stage's sink nodes (Output, Track out); their sum is the stage's audible output. */
  readonly outputSources: readonly Float32Array[]
  readonly byId: ReadonlyMap<string, DspNode>
}

export const bufferKey = (nodeId: string, portId: string): string => `${nodeId}:${portId}`

const newBuffer = () => new Float32Array(MAX_BLOCK_FRAMES)

/**
 * Instantiates the nodes in `order` (already topologically sorted) and wires them with
 * preallocated buffers. `seeded` provides buffers produced elsewhere (voice -> shared boundary).
 */
export const compileStage = (
  patch: Patch,
  order: readonly string[],
  sampleRate: number,
  seeded: ReadonlyMap<string, Float32Array> = new Map(),
): CompiledStage => {
  const nodesById = new Map(patch.nodes.map((node) => [node.id, node]))
  const outputBuffers = new Map(seeded)
  const byId = new Map<string, DspNode>()
  const nodes: CompiledNode[] = []
  const outputSources: Float32Array[] = []

  for (const id of order) {
    const node = nodesById.get(id)
    if (!node) continue
    const definition = requireNodeDefinition(node.type)

    const dsp = definition.create(sampleRate)
    for (const [paramId, value] of Object.entries(node.params)) dsp.setParam(paramId, value)
    if (node.sampleId !== undefined) dsp.setSample?.(node.sampleId)

    const outputs = definition.outputs.map((port) => {
      const buffer = newBuffer()
      outputBuffers.set(bufferKey(id, port.id), buffer)
      return buffer
    })

    const sums: Array<{ target: Float32Array; sources: readonly Float32Array[] }> = []
    const inputs = definition.inputs.map((port) => {
      const sources = patch.connections
        .filter((c) => c.to.node === id && c.to.port === port.id)
        .map((c) => outputBuffers.get(bufferKey(c.from.node, c.from.port)))
        .filter((buffer): buffer is Float32Array => buffer !== undefined)

      if (sources.length === 0) return null
      if (sources.length === 1) return sources[0] ?? null
      const target = newBuffer()
      sums.push({ target, sources })
      return target
    })

    if (definition.sink === true && inputs[0]) outputSources.push(inputs[0])

    byId.set(id, dsp)
    nodes.push({ id, dsp, inputs, outputs, sums })
  }

  return { nodes, outputBuffers, outputSources, byId }
}

/** Runs every node of a stage for `context.frames` samples. */
export const processStage = (stage: CompiledStage, context: ProcessContext): void => {
  const { frames } = context
  for (const node of stage.nodes) {
    for (const { target, sources } of node.sums) {
      target.fill(0, 0, frames)
      for (const source of sources) {
        for (let i = 0; i < frames; i++) target[i] = (target[i] ?? 0) + (source[i] ?? 0)
      }
    }
    node.dsp.process(context, node.inputs, node.outputs)
  }
}
