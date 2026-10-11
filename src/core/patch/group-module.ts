import { createId } from '../shared'
import {
  MODULE_NODE_TYPE,
  type ModuleDefinition,
  type ModuleKnob,
  type ModuleLibrary,
  type ModulePort,
  exposedPortId,
} from './module-types'
import { describeNode, findModule, kindsConnect } from './node-shape'
import type { Patch, PatchConnection, PatchNode, PortRef } from './types'

export interface GroupResult {
  /** The patch with the selected nodes replaced by one use of the new module. */
  readonly patch: Patch
  readonly module: ModuleDefinition
  readonly use: PatchNode
}

/** "In", or "Filter In" when two exposed ports would otherwise carry the same label. */
const portLabels = (refs: readonly PortRef[], patch: Patch, modules: ModuleLibrary, direction: 'inputs' | 'outputs') => {
  const labels = refs.map((ref) => {
    const node = patch.nodes.find((candidate) => candidate.id === ref.node)
    const shape = node && describeNode(node, modules)
    const port = shape?.[direction].find((candidate) => candidate.id === ref.port)
    return { node: shape?.label ?? '', port: port?.label ?? ref.port }
  })
  return labels.map(({ node, port }) => (labels.filter((other) => other.port === port).length > 1 ? `${node} ${port}` : port))
}

const uniqueRefs = (refs: readonly PortRef[]): PortRef[] => {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const key = exposedPortId(ref)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const makePorts = (refs: readonly PortRef[], patch: Patch, modules: ModuleLibrary, direction: 'inputs' | 'outputs'): ModulePort[] => {
  const unique = uniqueRefs(refs)
  const labels = portLabels(unique, patch, modules, direction)
  return unique.map((inner, index) => ({ id: exposedPortId(inner), label: labels[index] ?? inner.port, inner }))
}

/**
 * Turns the selected nodes into a module and puts one use of it where they were. The module's inputs and
 * outputs are the connections that crossed the selection's edge, so the surrounding patch keeps working
 * exactly as before; more ports and knobs can be exposed afterwards. Null when nothing is selected.
 */
export const groupIntoModule = (
  patch: Patch,
  nodeIds: Iterable<string>,
  name: string,
  modules: ModuleLibrary,
): GroupResult | null => {
  const selected = new Set(nodeIds)
  const inside = patch.nodes.filter((node) => selected.has(node.id))
  if (inside.length === 0) return null

  const insideIds = new Set(inside.map((node) => node.id))
  const innerConnections = patch.connections.filter((c) => insideIds.has(c.from.node) && insideIds.has(c.to.node))
  const incoming = patch.connections.filter((c) => !insideIds.has(c.from.node) && insideIds.has(c.to.node))
  const outgoing = patch.connections.filter((c) => insideIds.has(c.from.node) && !insideIds.has(c.to.node))

  const left = Math.min(...inside.map((node) => node.x))
  const top = Math.min(...inside.map((node) => node.y))
  const innerPatch: Patch = {
    nodes: inside.map((node) => ({ ...node, x: node.x - left, y: node.y - top })),
    connections: innerConnections,
  }

  const module: ModuleDefinition = {
    id: createId('module'),
    name,
    patch: innerPatch,
    inputs: makePorts(incoming.map((c) => c.to), innerPatch, modules, 'inputs'),
    outputs: makePorts(outgoing.map((c) => c.from), innerPatch, modules, 'outputs'),
    knobs: [],
  }
  const use: PatchNode = { id: createId('node'), type: MODULE_NODE_TYPE, moduleId: module.id, x: left, y: top, params: {} }

  const rewired: PatchConnection[] = [
    ...incoming.map((c) => ({ ...c, to: { node: use.id, port: exposedPortId(c.to) } })),
    ...outgoing.map((c) => ({ ...c, from: { node: use.id, port: exposedPortId(c.from) } })),
  ]
  return {
    module,
    use,
    patch: {
      ...patch,
      nodes: [...patch.nodes.filter((node) => !insideIds.has(node.id)), use],
      connections: [
        ...patch.connections.filter((c) => !insideIds.has(c.from.node) && !insideIds.has(c.to.node)),
        ...rewired,
      ],
    },
  }
}

/** A new use of a module, with every knob at the value stored in the definition. */
export const createModuleUse = (definition: ModuleDefinition, x: number, y: number): PatchNode => ({
  id: createId('node'),
  type: MODULE_NODE_TYPE,
  moduleId: definition.id,
  x,
  y,
  params: {},
})

/** Keeps `inputs`/`outputs`/`knobs` pointing only at nodes, ports and parameters that still exist inside. */
export const pruneModuleInterface = (definition: ModuleDefinition, modules: ModuleLibrary): ModuleDefinition => {
  const has = (ref: PortRef, direction: 'inputs' | 'outputs') => {
    const node = definition.patch.nodes.find((candidate) => candidate.id === ref.node)
    return Boolean(node && describeNode(node, modules)?.[direction].some((port) => port.id === ref.port))
  }
  const knobOk = (knob: ModuleKnob) => {
    const node = definition.patch.nodes.find((candidate) => candidate.id === knob.node)
    return Boolean(node && describeNode(node, modules)?.params.some((spec) => spec.id === knob.param))
  }
  const inputs = definition.inputs.filter((port) => has(port.inner, 'inputs'))
  const outputs = definition.outputs.filter((port) => has(port.inner, 'outputs'))
  const knobs = definition.knobs.filter(knobOk)
  return inputs.length === definition.inputs.length &&
    outputs.length === definition.outputs.length &&
    knobs.length === definition.knobs.length
    ? definition
    : { ...definition, inputs, outputs, knobs }
}

/**
 * Removes connections and parameter values on module uses that refer to ports or knobs the definition no
 * longer has. Returns the same patch object when nothing needed fixing.
 */
export const pruneModuleUses = (patch: Patch, modules: ModuleLibrary): Patch => {
  const portExists = (ref: PortRef, direction: 'inputs' | 'outputs'): boolean => {
    const node = patch.nodes.find((candidate) => candidate.id === ref.node)
    if (!node || node.type !== MODULE_NODE_TYPE) return true
    const definition = findModule(modules, node.moduleId)
    return Boolean(definition?.[direction].some((port) => port.id === ref.port))
  }
  // A module's port takes the kind of the inner port it stands for, which changes when that node goes stereo.
  const kindOf = (ref: PortRef, direction: 'inputs' | 'outputs') => {
    const node = patch.nodes.find((candidate) => candidate.id === ref.node)
    return node && describeNode(node, modules)?.[direction].find((port) => port.id === ref.port)?.kind
  }
  const touchesModule = (c: PatchConnection) =>
    [c.from.node, c.to.node].some((id) => patch.nodes.find((node) => node.id === id)?.type === MODULE_NODE_TYPE)
  const connections = patch.connections.filter(
    (c) =>
      portExists(c.from, 'outputs') &&
      portExists(c.to, 'inputs') &&
      (!touchesModule(c) || kindsConnect(kindOf(c.from, 'outputs'), kindOf(c.to, 'inputs'))),
  )

  let changed = connections.length !== patch.connections.length
  const nodes = patch.nodes.map((node) => {
    if (node.type !== MODULE_NODE_TYPE) return node
    const definition = findModule(modules, node.moduleId)
    const valid = new Set(definition?.knobs.map((knob) => knob.id))
    const stale = Object.keys(node.params).filter((id) => !valid.has(id))
    if (stale.length === 0) return node
    changed = true
    return { ...node, params: Object.fromEntries(Object.entries(node.params).filter(([id]) => valid.has(id))) }
  })
  return changed ? { ...patch, nodes, connections } : patch
}
