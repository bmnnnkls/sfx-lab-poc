import { type NodeDefinition, type ParamSpec, findNodeDefinition } from '../dsp'
import { MODULE_NODE_TYPE, type ModuleDefinition, type ModuleLibrary } from './module-types'
import type { PatchNode } from './types'

/** What the editor and the connection rules need to know about a node: its ports and parameters. */
export type NodeShape = Pick<NodeDefinition, 'label' | 'inputs' | 'outputs' | 'params' | 'usesSample'>

export const findModule = (modules: ModuleLibrary, id: string | undefined): ModuleDefinition | undefined =>
  id === undefined ? undefined : modules.find((candidate) => candidate.id === id)

/** The shape of a module's knob parameters: the inner node's own spec, renamed, defaulting to its current value. */
const knobSpecs = (definition: ModuleDefinition, modules: ModuleLibrary): ParamSpec[] =>
  definition.knobs.flatMap((knob) => {
    const inner = definition.patch.nodes.find((node) => node.id === knob.node)
    const spec = inner && describeNode(inner, modules)?.params.find((candidate) => candidate.id === knob.param)
    return inner && spec ? [{ ...spec, id: knob.id, label: knob.label, default: inner.params[knob.param] ?? spec.default }] : []
  })

/**
 * Ports and parameters of any node: built-in types come from the registry, uses of a module from its
 * definition. Undefined for an unknown type or a module that is not in the library.
 */
export const describeNode = (node: PatchNode, modules: ModuleLibrary = []): NodeShape | undefined => {
  if (node.type !== MODULE_NODE_TYPE) return findNodeDefinition(node.type)
  const definition = findModule(modules, node.moduleId)
  if (!definition) return undefined
  return {
    label: definition.name,
    inputs: definition.inputs.map(({ id, label }) => ({ id, label })),
    outputs: definition.outputs.map(({ id, label }) => ({ id, label })),
    params: knobSpecs(definition, modules),
  }
}
