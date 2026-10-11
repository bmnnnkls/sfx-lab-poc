import { NOTE_MODULE_TYPE, type NoteModuleDefinition, type NoteModuleLibrary } from './module-types'
import { describeNoteEffect, findNoteModule } from './effect-shape'
import type { NoteEffect } from './types'
import { createId } from '../shared'

/** Safety valve: a malformed library (a module containing itself) must not expand forever. */
const MAX_EXPANSIONS = 1000

/** The module's effects with this use's knob settings applied and its bypass switch respected. */
const contentsOf = (use: NoteEffect, definition: NoteModuleDefinition, modules: NoteModuleLibrary): NoteEffect[] =>
  definition.effects.map((effect) => {
    const specs = new Map((describeNoteEffect(effect, modules)?.params ?? []).map((spec) => [spec.id, spec]))
    const params = { ...effect.params }
    for (const knob of definition.knobs) {
      const value = use.params[knob.id]
      if (knob.effect === effect.id && value !== undefined && specs.has(knob.param)) params[knob.param] = value
    }
    return { ...effect, params, bypassed: effect.bypassed || use.bypassed }
  })

/**
 * Replaces one use of a module in a chain by a copy of its contents, with ids from `newId`, knob values baked in,
 * and bypassed when the use is. Returns the chain unchanged when there is no such use.
 */
export const expandNoteModuleUse = (
  effects: readonly NoteEffect[],
  useId: string,
  modules: NoteModuleLibrary,
  newId: (innerId: string) => string,
): NoteEffect[] =>
  effects.flatMap((effect) => {
    if (effect.id !== useId || effect.type !== NOTE_MODULE_TYPE) return [effect]
    const definition = findNoteModule(modules, effect.moduleId)
    if (!definition) return []
    return contentsOf(effect, definition, modules).map((inner) => ({ ...inner, id: newId(inner.id) }))
  })

/**
 * The chain with every module use replaced by its contents, recursively: what the engine runs. Inner ids are
 * `<use id>/<inner id>`, so a knob keeps its identity from edit to edit and the running effect keeps its state.
 */
export const flattenNoteEffects = (effects: readonly NoteEffect[], modules: NoteModuleLibrary): readonly NoteEffect[] => {
  if (!effects.some((effect) => effect.type === NOTE_MODULE_TYPE)) return effects

  let flat: NoteEffect[] = [...effects]
  for (let expansions = 0; expansions < MAX_EXPANSIONS; expansions++) {
    const use = flat.find((effect) => effect.type === NOTE_MODULE_TYPE)
    if (!use) return flat
    flat = expandNoteModuleUse(flat, use.id, modules, (innerId) => `${use.id}/${innerId}`)
  }
  // Only reachable with a module that contains itself: drop what is left rather than loop.
  return flat.filter((effect) => effect.type !== NOTE_MODULE_TYPE)
}

/** Turns a use into an independent copy of the module's contents, with fresh ids. */
export const unlinkNoteModuleUse = (effects: readonly NoteEffect[], useId: string, modules: NoteModuleLibrary): NoteEffect[] =>
  expandNoteModuleUse(effects, useId, modules, () => createId('fx'))

/** Module ids a definition uses directly. */
export const noteModulesUsedBy = (definition: NoteModuleDefinition): string[] => [
  ...new Set(definition.effects.flatMap((effect) => (effect.moduleId ? [effect.moduleId] : []))),
]

/** True when `candidate` is `host` or contains it at any depth: placing it inside `host` would loop. */
export const containsNoteModule = (
  modules: NoteModuleLibrary,
  candidate: string,
  host: string,
  seen = new Set<string>(),
): boolean => {
  if (candidate === host) return true
  if (seen.has(candidate)) return false
  seen.add(candidate)
  const definition = findNoteModule(modules, candidate)
  return definition ? noteModulesUsedBy(definition).some((child) => containsNoteModule(modules, child, host, seen)) : false
}
