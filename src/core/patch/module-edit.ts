import { type ModuleDefinition, type ModuleKnob, type ModulePort, exposedKnobId, exposedPortId } from './module-types'
import type { Patch, PortRef } from './types'

/** Pure edits of a module definition's interface (which inner ports and parameters show on the outside). */

export const renameModule = (definition: ModuleDefinition, name: string): ModuleDefinition =>
  name === definition.name ? definition : { ...definition, name }

export const setModulePatch = (definition: ModuleDefinition, patch: Patch): ModuleDefinition =>
  patch === definition.patch ? definition : { ...definition, patch }

type PortKind = 'inputs' | 'outputs'

export const exposePort = (definition: ModuleDefinition, kind: PortKind, inner: PortRef, label: string): ModuleDefinition => {
  const id = exposedPortId(inner)
  if (definition[kind].some((port) => port.id === id)) return definition
  const port: ModulePort = { id, label, inner }
  return { ...definition, [kind]: [...definition[kind], port] }
}

export const hidePort = (definition: ModuleDefinition, kind: PortKind, portId: string): ModuleDefinition =>
  definition[kind].some((port) => port.id === portId)
    ? { ...definition, [kind]: definition[kind].filter((port) => port.id !== portId) }
    : definition

export const labelPort = (definition: ModuleDefinition, kind: PortKind, portId: string, label: string): ModuleDefinition => ({
  ...definition,
  [kind]: definition[kind].map((port) => (port.id === portId ? { ...port, label } : port)),
})

export const exposeKnob = (definition: ModuleDefinition, node: string, param: string, label: string): ModuleDefinition => {
  const id = exposedKnobId(node, param)
  if (definition.knobs.some((knob) => knob.id === id)) return definition
  const knob: ModuleKnob = { id, label, node, param }
  return { ...definition, knobs: [...definition.knobs, knob] }
}

export const hideKnob = (definition: ModuleDefinition, knobId: string): ModuleDefinition =>
  definition.knobs.some((knob) => knob.id === knobId)
    ? { ...definition, knobs: definition.knobs.filter((knob) => knob.id !== knobId) }
    : definition

export const labelKnob = (definition: ModuleDefinition, knobId: string, label: string): ModuleDefinition => ({
  ...definition,
  knobs: definition.knobs.map((knob) => (knob.id === knobId ? { ...knob, label } : knob)),
})
