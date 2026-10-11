import { createId } from '../shared'
import { MODULE_NODE_TYPE, type ModuleDefinition, type ModuleLibrary } from './module-types'
import { describeNode, findModule } from './node-shape'
import type { Patch, PatchConnection, PatchNode } from './types'

/** Safety valve: a malformed library (a module containing itself) must not expand forever. */
const MAX_EXPANSIONS = 1000

/** The inner nodes' parameters with this use's knob settings applied. */
const withKnobs = (use: PatchNode, definition: ModuleDefinition, modules: ModuleLibrary): PatchNode[] =>
  definition.patch.nodes.map((node) => {
    const knobs = definition.knobs.filter((knob) => knob.node === node.id)
    if (knobs.length === 0) return node
    const specs = new Map((describeNode(node, modules)?.params ?? []).map((spec) => [spec.id, spec]))
    const params = { ...node.params }
    for (const knob of knobs) {
      const value = use.params[knob.id]
      if (value !== undefined && specs.has(knob.param)) params[knob.param] = value
    }
    return { ...node, params }
  })

/**
 * Replaces one use of a module by a copy of its contents: nodes get ids from `newId`, wires into and out of
 * the use are re-pointed at the inner ports, and the knob settings of the use are baked in. Wires to ports
 * the module does not have are dropped. Returns the patch unchanged when the use is not in it.
 */
export const expandModuleUse = (
  patch: Patch,
  useId: string,
  modules: ModuleLibrary,
  newId: (innerId: string, kind: 'node' | 'wire') => string,
): Patch => {
  const use = patch.nodes.find((node) => node.id === useId)
  if (!use || use.type !== MODULE_NODE_TYPE) return patch
  const definition = findModule(modules, use.moduleId)

  const others = patch.nodes.filter((node) => node !== use)
  if (!definition) {
    return { nodes: others, connections: patch.connections.filter((c) => c.from.node !== useId && c.to.node !== useId) }
  }

  const idOf = new Map(definition.patch.nodes.map((node) => [node.id, newId(node.id, 'node')]))
  const inner = (id: string): string => idOf.get(id) ?? id
  const copies = withKnobs(use, definition, modules).map((node) => ({
    ...node,
    id: inner(node.id),
    x: use.x + node.x,
    y: use.y + node.y,
  }))

  const connections: PatchConnection[] = []
  for (const connection of patch.connections) {
    if (connection.to.node === useId) {
      const port = definition.inputs.find((candidate) => candidate.id === connection.to.port)
      if (port) connections.push({ ...connection, to: { node: inner(port.inner.node), port: port.inner.port } })
    } else if (connection.from.node === useId) {
      const port = definition.outputs.find((candidate) => candidate.id === connection.from.port)
      if (port) connections.push({ ...connection, from: { node: inner(port.inner.node), port: port.inner.port } })
    } else {
      connections.push(connection)
    }
  }
  for (const connection of definition.patch.connections) {
    connections.push({
      id: newId(connection.id, 'wire'),
      from: { node: inner(connection.from.node), port: connection.from.port },
      to: { node: inner(connection.to.node), port: connection.to.port },
    })
  }
  return { nodes: [...others, ...copies], connections }
}

/**
 * The patch with every module use replaced by its contents (recursively), which is what the engine plays.
 * Inner node ids are `<use id>/<inner id>`, so the same knob keeps the same id from edit to edit and a
 * parameter change reaches the engine as a plain parameter change.
 */
export const flattenPatch = (patch: Patch, modules: ModuleLibrary): Patch => {
  if (!patch.nodes.some((node) => node.type === MODULE_NODE_TYPE)) return patch

  let flat = patch
  for (let expansions = 0; expansions < MAX_EXPANSIONS; expansions++) {
    const use = flat.nodes.find((node) => node.type === MODULE_NODE_TYPE)
    if (!use) return flat
    flat = expandModuleUse(flat, use.id, modules, (innerId) => `${use.id}/${innerId}`)
  }
  // Only reachable with a module that contains itself: drop what is left rather than loop.
  return {
    nodes: flat.nodes.filter((node) => node.type !== MODULE_NODE_TYPE),
    connections: flat.connections.filter((c) => !isModuleNode(flat, c.from.node) && !isModuleNode(flat, c.to.node)),
  }
}

const isModuleNode = (patch: Patch, id: string): boolean =>
  patch.nodes.find((node) => node.id === id)?.type === MODULE_NODE_TYPE

/** Replaces a use by an independent copy of its contents with fresh ids: the "make this one mine" operation. */
export const unlinkModuleUse = (patch: Patch, useId: string, modules: ModuleLibrary): Patch =>
  expandModuleUse(patch, useId, modules, (_innerId, kind) => createId(kind === 'wire' ? 'wire' : 'node'))

/** Module ids a definition uses directly. */
export const modulesUsedBy = (definition: ModuleDefinition): string[] => [
  ...new Set(definition.patch.nodes.flatMap((node) => (node.moduleId ? [node.moduleId] : []))),
]

/** True when `candidate` is `host` or contains it, at any depth: placing it inside `host` would loop. */
export const containsModule = (modules: ModuleLibrary, candidate: string, host: string, seen = new Set<string>()): boolean => {
  if (candidate === host) return true
  if (seen.has(candidate)) return false
  seen.add(candidate)
  const definition = findModule(modules, candidate)
  return definition ? modulesUsedBy(definition).some((child) => containsModule(modules, child, host, seen)) : false
}
