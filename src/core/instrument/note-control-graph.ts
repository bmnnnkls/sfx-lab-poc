import { type ProcessContext, findNodeDefinition, paramOfPort } from '../dsp'
import { type Patch, topologicalOrder } from '../patch'
import { bufferKey, compileStage, processStage, setStageParam } from './compile'


/** Dynamic counterpart of note-graph constant baking. Helpers retain normal wire ownership. */
export class NoteControlGraph {
  private readonly stage: ReturnType<typeof compileStage>
  private readonly feeds: readonly { nodeId: string; paramId: string; sources: readonly Float32Array[] }[]
  private readonly context: ProcessContext
  private readonly signature: string
  constructor(patch: Patch, sampleRate: number) {
    this.context = { frames: 1, sampleRate, note: { frequency: 0, velocity: 0, gate: false, trigger: 0 }, samples: { get: () => undefined, loopOf: () => undefined } }
    this.signature = structure(patch)
    const nodes = patch.nodes.filter((node) => findNodeDefinition(node.type)?.global === true)
    const ids = new Set(nodes.map((node) => node.id))
    const helpers = { nodes, connections: patch.connections.filter((wire) => ids.has(wire.to.node) && ids.has(wire.from.node)) }
    this.stage = compileStage(helpers, topologicalOrder(helpers) ?? [], sampleRate)
    const feeds = new Map<string, { nodeId: string; paramId: string; sources: Float32Array[]; valid: boolean }>()
    for (const wire of patch.connections) {
      const paramId = paramOfPort(wire.to.port)
      if (!paramId || ids.has(wire.to.node)) continue
      const key = bufferKey(wire.to.node, paramId)
      const entry = feeds.get(key) ?? { nodeId: wire.to.node, paramId, sources: [], valid: true }
      const source = this.stage.outputBuffers.get(bufferKey(wire.from.node, wire.from.port))
      if (source) entry.sources.push(source); else entry.valid = false
      feeds.set(key, entry)
    }
    this.feeds = [...feeds.values()].filter((entry) => entry.valid)
  }
  get clocked(): boolean { return this.stage.nodes.length > 0 }

  /** Parameter-only/configuration updates never clock a helper. Structural changes reset it. */
  sync(patch: Patch): boolean {
    if (structure(patch) !== this.signature) return false
    for (const node of patch.nodes) for (const [id, value] of Object.entries(node.params)) this.setParam(node.id, id, value)
    return true
  }
  setParam(nodeId: string, paramId: string, value: number): void { setStageParam(this.stage, nodeId, paramId, value) }
  process(write: (nodeId: string, paramId: string, value: number) => void): void {
    processStage(this.stage, this.context)
    for (const feed of this.feeds) {
      const value = feed.sources.reduce((sum, source) => sum + (source[0] ?? 0), 0)
      if (Number.isFinite(value)) write(feed.nodeId, feed.paramId, value)
    }
  }
}

const structure = (patch: Patch): string => JSON.stringify([patch.nodes.map(n => [n.id, n.type]), patch.connections.map(w => [w.from.node, w.from.port, w.to.node, w.to.port])])
