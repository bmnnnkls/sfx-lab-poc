import { type DspNode, OUTPUT_NODE_TYPE, requireNodeDefinition } from '../dsp'
import { type Patch, topologicalOrder } from '../patch'

export const MAX_BLOCK_FRAMES = 128

export interface CompiledNode {
  readonly id: string
  readonly dsp: DspNode
  /** Resolved input buffers, in definition order; null when unconnected. */
  readonly inputs: ReadonlyArray<Float32Array | null>
  readonly outputs: readonly Float32Array[]
  /** Source buffers that must be summed into `inputs[i]` before processing. */
  readonly sums: ReadonlyArray<{ target: Float32Array; sources: readonly Float32Array[] }>
}

export interface CompiledPatch {
  /** Nodes in execution order. */
  readonly nodes: readonly CompiledNode[]
  /** Buffers feeding Output nodes; the instrument's audio is their sum. */
  readonly outputSources: readonly Float32Array[]
  readonly byId: ReadonlyMap<string, DspNode>
}

const newBuffer = () => new Float32Array(MAX_BLOCK_FRAMES)

/** Turns an immutable patch into DSP instances wired together with preallocated buffers. */
export const compilePatch = (patch: Patch, sampleRate: number): CompiledPatch => {
  const order = topologicalOrder(patch)
  if (!order) throw new Error('Patch contains a cycle')

  const nodesById = new Map(patch.nodes.map((node) => [node.id, node]))
  const outputBuffers = new Map<string, Float32Array>()
  const byId = new Map<string, DspNode>()
  const nodes: CompiledNode[] = []
  const outputSources: Float32Array[] = []

  for (const id of order) {
    const node = nodesById.get(id)
    if (!node) continue
    const definition = requireNodeDefinition(node.type)

    const dsp = definition.create(sampleRate)
    for (const [paramId, value] of Object.entries(node.params)) dsp.setParam(paramId, value)

    const outputs = definition.outputs.map((port) => {
      const buffer = newBuffer()
      outputBuffers.set(`${id}:${port.id}`, buffer)
      return buffer
    })

    const sums: Array<{ target: Float32Array; sources: readonly Float32Array[] }> = []
    const inputs = definition.inputs.map((port) => {
      const sources = patch.connections
        .filter((c) => c.to.node === id && c.to.port === port.id)
        .map((c) => outputBuffers.get(`${c.from.node}:${c.from.port}`))
        .filter((buffer): buffer is Float32Array => buffer !== undefined)

      if (sources.length === 0) return null
      if (sources.length === 1) return sources[0] ?? null
      const target = newBuffer()
      sums.push({ target, sources })
      return target
    })

    if (node.type === OUTPUT_NODE_TYPE) {
      // An Output node has a single input; reuse the resolved buffer so sums are honoured.
      const resolved = inputs[0]
      if (resolved) outputSources.push(resolved)
    }

    byId.set(id, dsp)
    nodes.push({ id, dsp, inputs, outputs, sums })
  }

  return { nodes, outputSources, byId }
}
