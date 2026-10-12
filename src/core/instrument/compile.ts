import {
  type DspNode,
  MAX_BLOCK_FRAMES,
  type PortSpec,
  type ProcessContext,
  RIGHT,
  STEREO_FRAMES,
  isStereoBuffer,
  leftOf,
  paramOfPort,
  requireNodeDefinition,
  rightOf,
  stereoPorts,
} from '../dsp'
import type { Patch } from '../patch'

export { MAX_BLOCK_FRAMES }

/** One processor with the buffers it reads and writes. A node running in stereo has two, one per channel. */
export interface CompiledRun {
  readonly dsp: DspNode
  /** Resolved input buffers, in definition order; null when unconnected. */
  readonly inputs: ReadonlyArray<Float32Array | null>
  readonly outputs: readonly Float32Array[]
}

/**
 * A wired parameter socket: once per block the first sample of each source (summed) is applied with `setParam`, in
 * place of the stored value. Audio-rate modulation has its own ports; a socket is a knob, not a signal.
 */
export interface ParamFeed {
  /** Every copy of the node (two for a node running in stereo). */
  readonly dsps: readonly DspNode[]
  readonly paramId: string
  readonly sources: readonly Float32Array[]
  /** What was last applied. A steady wire then costs nothing, and a node that redesigns itself on `setParam` is not poked every block. */
  last: number
}

export interface CompiledNode {
  readonly id: string
  readonly runs: readonly CompiledRun[]
  readonly paramFeeds: readonly ParamFeed[]
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
  /** The processors of each node (two for a node running in stereo). */
  readonly byId: ReadonlyMap<string, readonly DspNode[]>
  /** `bufferKey(node, param)` of every parameter a wire is driving: the stored value of those is ignored. */
  readonly driven: ReadonlySet<string>
}

export const bufferKey = (nodeId: string, portId: string): string => `${nodeId}:${portId}`

const newBuffer = (stereo = false) => new Float32Array(stereo ? STEREO_FRAMES : MAX_BLOCK_FRAMES)

/**
 * Changes a parameter of a node of the stage, in every copy of it. A parameter with a wire into its socket is left
 * alone: the wire wins, and a knob turned on the stored value must not fight it.
 */
export const setStageParam = (stage: CompiledStage, nodeId: string, paramId: string, value: number): void => {
  if (stage.driven.has(bufferKey(nodeId, paramId))) return
  for (const dsp of stage.byId.get(nodeId) ?? []) dsp.setParam(paramId, value)
}

/**
 * Adds the latest value of every indicator node of the stage to `into`, by node id (`DspNode.readout`). Nothing is allocated unless
 * the stage has one, so a patch without indicators costs a walk over its nodes and no more.
 */
export const stageReadouts = (stage: CompiledStage, into: Record<string, number>): void => {
  for (const [id, dsps] of stage.byId) {
    const dsp = dsps[0]
    if (dsp?.readout) into[id] = dsp.readout()
  }
}

export const setStageSample = (stage: CompiledStage, nodeId: string, sampleId: string | null): void => {
  for (const dsp of stage.byId.get(nodeId) ?? []) dsp.setSample?.(sampleId)
}

/**
 * Instantiates the nodes in `order` (already topologically sorted) and wires them with
 * preallocated buffers. `seeded` provides buffers produced elsewhere (voice -> shared boundary).
 *
 * `voiceSalt` is the voice's slot in the pool (0 outside a voice), handed to every node's `create`, so seeded sources differ between voices.
 *
 * A node set to run in stereo gets two processors with the same parameters, each working on one channel of its
 * stereo ports (views into the same planar buffers); its modulation inputs are shared by both.
 */
export const compileStage = (
  patch: Patch,
  order: readonly string[],
  sampleRate: number,
  seeded: ReadonlyMap<string, Float32Array> = new Map(),
  voiceSalt = 0,
): CompiledStage => {
  const nodesById = new Map(patch.nodes.map((node) => [node.id, node]))
  const outputBuffers = new Map(seeded)
  const byId = new Map<string, DspNode[]>()
  const nodes: CompiledNode[] = []
  const outputSources: Float32Array[] = []
  const driven = new Set<string>()

  for (const id of order) {
    const node = nodesById.get(id)
    if (!node) continue
    const definition = requireNodeDefinition(node.type)
    const lifted = node.stereo === true && definition.stereoCapable === true
    const ports: { inputs: readonly PortSpec[]; outputs: readonly PortSpec[] } = lifted ? stereoPorts(definition) : definition

    const copies = Array.from({ length: lifted ? 2 : 1 }, () => {
      const dsp = definition.create(sampleRate, voiceSalt)
      for (const [paramId, value] of Object.entries(node.params)) dsp.setParam(paramId, value)
      if (node.sampleId !== undefined) dsp.setSample?.(node.sampleId)
      if (node.trackId !== undefined) dsp.setTrack?.(node.trackId)
      return dsp
    })

    const outputs = ports.outputs.map((port) => {
      const buffer = newBuffer(port.kind === 'stereo')
      outputBuffers.set(bufferKey(id, port.id), buffer)
      return buffer
    })

    const sums: Array<{ target: Float32Array; sources: readonly Float32Array[] }> = []
    const inputs = ports.inputs.map((port) => {
      const sources = patch.connections
        .filter((c) => c.to.node === id && c.to.port === port.id)
        .map((c) => outputBuffers.get(bufferKey(c.from.node, c.from.port)))
        .filter((buffer): buffer is Float32Array => buffer !== undefined)

      if (sources.length === 0) return null
      const stereo = port.kind === 'stereo'
      // A single source of the right shape is read directly; anything else (several sources, or a mono signal
      // heard in both channels of a stereo input) goes through a buffer of its own.
      if (sources.length === 1 && isStereoBuffer(sources[0] as Float32Array) === stereo) return sources[0] ?? null
      const target = newBuffer(stereo)
      sums.push({ target, sources })
      return target
    })

    const runs: CompiledRun[] = copies.map((dsp, channel) => {
      if (!lifted) return { dsp, inputs, outputs }
      // One processor per channel: stereo ports are narrowed to that channel's half, modulation ports are shared.
      const half = (buffer: Float32Array | null, port: PortSpec) =>
        buffer && port.kind === 'stereo' ? (channel === 0 ? leftOf(buffer) : rightOf(buffer)) : buffer
      return {
        dsp,
        inputs: inputs.map((buffer, index) => half(buffer, ports.inputs[index] as PortSpec)),
        outputs: outputs.map((buffer, index) => half(buffer, ports.outputs[index] as PortSpec) as Float32Array),
      }
    })

    // Parameter sockets: each parameter with at least one wire into its socket is read from those wires every block.
    const feeds = new Map<string, Float32Array[]>()
    for (const connection of patch.connections) {
      const paramId = connection.to.node === id ? paramOfPort(connection.to.port) : undefined
      const source = paramId === undefined ? undefined : outputBuffers.get(bufferKey(connection.from.node, connection.from.port))
      if (paramId === undefined || !source || !definition.params.some((spec) => spec.id === paramId)) continue
      feeds.set(paramId, [...(feeds.get(paramId) ?? []), source])
    }
    const paramFeeds: ParamFeed[] = [...feeds].map(([paramId, sources]) => {
      driven.add(bufferKey(id, paramId))
      return { dsps: copies, paramId, sources, last: Number.NaN }
    })

    if (definition.sink === true && inputs[0]) outputSources.push(inputs[0])

    byId.set(id, copies)
    nodes.push({ id, runs, sums, paramFeeds })
  }

  return { nodes, outputBuffers, outputSources, byId, driven }
}

/** Adds `source` into `target`; a mono source into a stereo target is heard in both channels. */
export const addInto = (target: Float32Array, source: Float32Array, frames: number): void => {
  if (isStereoBuffer(target)) {
    const stereo = isStereoBuffer(source)
    for (let i = 0; i < frames; i++) {
      target[i] = (target[i] ?? 0) + (source[i] ?? 0)
      target[RIGHT + i] = (target[RIGHT + i] ?? 0) + (source[stereo ? RIGHT + i : i] ?? 0)
    }
  } else {
    for (let i = 0; i < frames; i++) target[i] = (target[i] ?? 0) + (source[i] ?? 0)
  }
}

/** Runs every node of a stage for `context.frames` samples. */
export const processStage = (stage: CompiledStage, context: ProcessContext): void => {
  const { frames } = context
  for (const node of stage.nodes) {
    for (const { target, sources } of node.sums) {
      target.fill(0, 0, frames)
      if (isStereoBuffer(target)) target.fill(0, RIGHT, RIGHT + frames)
      for (const source of sources) addInto(target, source, frames)
    }
    for (const feed of node.paramFeeds) {
      let value = 0
      for (const source of feed.sources) value += source[0] ?? 0
      if (!Number.isFinite(value) || value === feed.last) continue
      feed.last = value
      for (const dsp of feed.dsps) dsp.setParam(feed.paramId, value)
    }
    for (const { dsp, inputs, outputs } of node.runs) dsp.process(context, inputs, outputs)
  }
}
