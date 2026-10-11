import type { ParamSpec } from '../dsp'
import { NOTE_MODULE_TYPE, type NoteModuleDefinition, type NoteModuleLibrary } from './module-types'
import { findNoteEffect } from './registry'
import type { NoteEffect } from './types'

/** What the editor needs to show an effect: its name and its parameters. */
export interface NoteEffectShape {
  readonly label: string
  readonly params: readonly ParamSpec[]
}

export const findNoteModule = (modules: NoteModuleLibrary, id: string | undefined): NoteModuleDefinition | undefined =>
  id === undefined ? undefined : modules.find((candidate) => candidate.id === id)

const knobSpecs = (definition: NoteModuleDefinition, modules: NoteModuleLibrary): ParamSpec[] =>
  definition.knobs.flatMap((knob) => {
    const inner = definition.effects.find((effect) => effect.id === knob.effect)
    const spec = inner && describeNoteEffect(inner, modules)?.params.find((candidate) => candidate.id === knob.param)
    return inner && spec ? [{ ...spec, id: knob.id, label: knob.label, default: inner.params[knob.param] ?? spec.default }] : []
  })

/**
 * Name and parameters of any chain entry: built-in effects from the registry, module uses from their definition
 * (the exposed knobs, defaulting to the value stored inside). Undefined for an unknown type or a missing module.
 */
export const describeNoteEffect = (effect: NoteEffect, modules: NoteModuleLibrary = []): NoteEffectShape | undefined => {
  if (effect.type !== NOTE_MODULE_TYPE) {
    const definition = findNoteEffect(effect.type)
    return definition && { label: definition.label, params: definition.params }
  }
  const definition = findNoteModule(modules, effect.moduleId)
  return definition && { label: definition.name, params: knobSpecs(definition, modules) }
}
