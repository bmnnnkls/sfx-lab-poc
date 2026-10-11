import { findNodeDefinition, paramOfPort } from '../dsp'
import { describeNode } from './node-shape'
import type { Patch, PatchNode } from './types'

/** The silent note and empty sample bank a one-frame evaluation runs with: nodes that can be resolved never look at them. */
const CONTEXT = {
  frames: 1,
  sampleRate: 48000,
  note: { frequency: 0, velocity: 0, gate: false, trigger: 0 },
  samples: { get: () => undefined },
} as const

/** Deep enough for any chain a person wires by hand; a bound on cost, since the patch is acyclic anyway. */
const MAX_DEPTH = 24

interface Evaluation {
  /** What each output port holds, by `node\0port`. `undefined` for a signal that is not a constant (an LFO, an oscillator). */
  readonly output: Map<string, number | undefined>
}

const key = (node: string, port: string): string => `${node}\0${port}`

/**
 * What one output of a node is *right now* if it is a constant: a control, a switch, a pad, and the math nodes fed by
 * those, run for one frame through the real DSP node. Anything that moves (an LFO, a note, an oscillator) is not a
 * constant, so it is undefined and the caller falls back to the stored value.
 */
const outputValue = (patch: Patch, nodeId: string, portId: string, run: Evaluation, depth: number): number | undefined => {
  const cached = run.output.get(key(nodeId, portId))
  if (cached !== undefined || run.output.has(key(nodeId, portId))) return cached
  run.output.set(key(nodeId, portId), undefined)
  const node = patch.nodes.find((candidate) => candidate.id === nodeId)
  const definition = node && findNodeDefinition(node.type)
  if (!node || !definition || definition.global !== true || definition.stereoCapable === true || depth > MAX_DEPTH) return undefined
  const outputIndex = definition.outputs.findIndex((port) => port.id === portId)
  if (outputIndex === -1) return undefined

  const dsp = definition.create(CONTEXT.sampleRate)
  const driven = drivenValues(patch, node, run, depth + 1)
  if (driven === undefined) return undefined
  for (const [id, value] of Object.entries({ ...node.params, ...driven })) dsp.setParam(id, value)
  // A wired input is a constant for this frame; an unwired one is null, so the node uses its own parameter.
  const inputs = definition.inputs.map((port) => {
    const sources = patch.connections.filter((c) => c.to.node === nodeId && c.to.port === port.id)
    if (sources.length === 0) return null
    let sum = 0
    for (const source of sources) {
      const value = outputValue(patch, source.from.node, source.from.port, run, depth + 1)
      if (value === undefined) return undefined
      sum += value
    }
    return Float32Array.of(sum)
  })
  if (inputs.includes(undefined)) return undefined
  const outputs = definition.outputs.map(() => new Float32Array(1))
  dsp.process(CONTEXT, inputs as Array<Float32Array | null>, outputs)
  const value = outputs[outputIndex]?.[0]
  const resolved = value !== undefined && Number.isFinite(value) ? value : undefined
  run.output.set(key(nodeId, portId), resolved)
  return resolved
}

/** The parameters of a node that a wire drives and whose value could be worked out; undefined when a wire carries something that moves. */
const drivenValues = (patch: Patch, node: PatchNode, run: Evaluation, depth: number): Record<string, number> | undefined => {
  const values: Record<string, number> = {}
  const sums = new Map<string, number>()
  for (const connection of patch.connections) {
    const param = connection.to.node === node.id ? paramOfPort(connection.to.port) : undefined
    if (param === undefined) continue
    const value = outputValue(patch, connection.from.node, connection.from.port, run, depth)
    if (value === undefined) return undefined
    sums.set(param, (sums.get(param) ?? 0) + value)
  }
  for (const [param, value] of sums) values[param] = value
  return values
}

/**
 * The numbers a node is actually working with: its stored parameters, with each parameter that a wire drives replaced by
 * what the wire carries (resolved through controls, switches, pads and math on them). A parameter driven by something
 * that moves (an LFO into a socket) keeps its stored value here and is listed in `moving`: a picture can say so, but not draw it.
 */
export const resolveParams = (patch: Patch, nodeId: string): { values: Record<string, number>; moving: ReadonlySet<string> } => {
  const node = patch.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return { values: {}, moving: new Set() }
  const run: Evaluation = { output: new Map() }
  const values: Record<string, number> = { ...node.params }
  const moving = new Set<string>()
  const sums = new Map<string, { total: number; ok: boolean }>()
  for (const connection of patch.connections) {
    const param = connection.to.node === nodeId ? paramOfPort(connection.to.port) : undefined
    if (param === undefined) continue
    const value = outputValue(patch, connection.from.node, connection.from.port, run, 0)
    const entry = sums.get(param) ?? { total: 0, ok: true }
    if (value === undefined) entry.ok = false
    else entry.total += value
    sums.set(param, entry)
  }
  for (const [param, { total, ok }] of sums) {
    // The node's own parameter clamps what it is given, so the picture shows what the engine plays.
    const spec = describeNode(node)?.params.find((candidate) => candidate.id === param)
    if (ok) values[param] = spec ? Math.min(spec.max, Math.max(spec.min, total)) : total
    else moving.add(param)
  }
  return { values, moving }
}
