import { type NodeDefinition, type ParamSpec, type PortKind, type PortSpec, findNodeDefinition, stereoPorts } from '../dsp'
import { findNoteNode } from '../notefx'
import { MODULE_NODE_TYPE, type ModuleDefinition, type ModuleLibrary, type ModulePort } from './module-types'
import type { PatchNode } from './types'

/** Which kind of patch a node belongs to: sound (`audio`) or notes (`notes`). */
export type NodeDomain = 'audio' | 'notes'

/** What the editor and the connection rules need to know about a node: its ports and parameters. */
export type NodeShape = Pick<NodeDefinition, 'label' | 'inputs' | 'outputs' | 'params' | 'usesSample' | 'stereoCapable'> & {
  /** The node refers to another track and the editor shows a track picker: `notes` takes notes from an instrument track, `return` sends to a return track. */
  readonly usesTrack?: 'notes' | 'return'
  /** A note effect that can be switched off (notes then pass straight through). */
  readonly bypassable?: boolean
  readonly domain?: NodeDomain
}

/**
 * Sound connects to sound, stereo to stereo and notes to notes, never across. A mono signal may also feed a stereo
 * input (it is heard in both channels); going back to mono is the explicit *Mono sum* node.
 */
export const kindsConnect = (from: PortKind = 'signal', to: PortKind = 'signal'): boolean =>
  from === to || (from === 'signal' && to === 'stereo')

export const findModule = (modules: ModuleLibrary, id: string | undefined): ModuleDefinition | undefined =>
  id === undefined ? undefined : modules.find((candidate) => candidate.id === id)

/** The shape of a module's knob parameters: the inner node's own spec, renamed, defaulting to its current value. */
const knobSpecs = (definition: ModuleDefinition, modules: ModuleLibrary): ParamSpec[] =>
  definition.knobs.flatMap((knob) => {
    const inner = definition.patch.nodes.find((node) => node.id === knob.node)
    const spec = inner && describeNode(inner, modules)?.params.find((candidate) => candidate.id === knob.param)
    return inner && spec ? [{ ...spec, id: knob.id, label: knob.label, default: inner.params[knob.param] ?? spec.default }] : []
  })

/** A module's port as the outside sees it: the inner port's kind carries over, so wires stay type-checked. */
const outsidePorts = (
  definition: ModuleDefinition,
  ports: readonly ModulePort[],
  direction: 'inputs' | 'outputs',
  modules: ModuleLibrary,
): PortSpec[] =>
  ports.map(({ id, label, inner }) => {
    const node = definition.patch.nodes.find((candidate) => candidate.id === inner.node)
    const kind = node && describeNode(node, modules)?.[direction].find((port) => port.id === inner.port)?.kind
    return kind ? { id, label, kind } : { id, label }
  })

/** The domain a module works in, from what is inside it. Undefined while it is empty (it fits anywhere). */
export const moduleDomain = (definition: ModuleDefinition, modules: ModuleLibrary, seen = new Set<string>()): NodeDomain | undefined => {
  if (seen.has(definition.id)) return undefined
  seen.add(definition.id)
  for (const node of definition.patch.nodes) {
    if (node.type === MODULE_NODE_TYPE) {
      const inner = findModule(modules, node.moduleId)
      const domain = inner && moduleDomain(inner, modules, seen)
      if (domain) return domain
    } else if (findNoteNode(node.type)) return 'notes'
    else if (findNodeDefinition(node.type)) return 'audio'
  }
  return undefined
}

/**
 * Ports and parameters of any node: sound nodes come from the DSP registry, note nodes from the note registry,
 * uses of a module from its definition. Undefined for an unknown type or a module that is not in the library.
 */
export const describeNode = (node: PatchNode, modules: ModuleLibrary = []): NodeShape | undefined => {
  if (node.type !== MODULE_NODE_TYPE) {
    const audio = findNodeDefinition(node.type)
    // A node running in stereo has stereo ports; everything else about it is the same.
    if (audio) return node.stereo === true && audio.stereoCapable === true ? { ...audio, ...stereoPorts(audio) } : audio
    const note = findNoteNode(node.type)
    return (
      note && {
        label: note.label,
        inputs: note.inputs,
        outputs: note.outputs,
        params: note.params,
        usesTrack: note.usesTrack === true ? 'notes' : undefined,
        bypassable: note.role === 'effect' && note.inputs.length === 1 && note.outputs.length === 1,
        domain: 'notes',
      }
    )
  }
  const definition = findModule(modules, node.moduleId)
  if (!definition) return undefined
  return {
    label: definition.name,
    inputs: outsidePorts(definition, definition.inputs, 'inputs', modules),
    outputs: outsidePorts(definition, definition.outputs, 'outputs', modules),
    params: knobSpecs(definition, modules),
    domain: moduleDomain(definition, modules),
  }
}
