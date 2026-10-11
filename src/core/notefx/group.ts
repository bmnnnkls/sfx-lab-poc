import { createId } from '../shared'
import { describeNoteEffect, findNoteModule } from './effect-shape'
import { NOTE_MODULE_TYPE, type NoteModuleDefinition, type NoteModuleKnob, type NoteModuleLibrary } from './module-types'
import type { NoteEffect } from './types'

export interface NoteGroupResult {
  /** The chain with the selected effects replaced by one use of the new module. */
  readonly effects: readonly NoteEffect[]
  readonly module: NoteModuleDefinition
  readonly use: NoteEffect
}

/** True when the effects with these ids sit next to each other in the chain (grouping would not reorder anything). */
export const isContiguous = (effects: readonly NoteEffect[], ids: Iterable<string>): boolean => {
  const selected = new Set(ids)
  const positions = effects.flatMap((effect, index) => (selected.has(effect.id) ? [index] : []))
  return positions.length > 0 && positions.length === selected.size && positions.at(-1)! - positions[0]! === positions.length - 1
}

/**
 * Turns a run of neighbouring effects into a module and puts one use of it where they were. Null unless the
 * selection is a non-empty contiguous run (so the order of the chain never changes). No knobs are shown until
 * you choose them.
 */
export const groupIntoNoteModule = (
  effects: readonly NoteEffect[],
  ids: Iterable<string>,
  name: string,
): NoteGroupResult | null => {
  const selected = new Set(ids)
  if (!isContiguous(effects, selected)) return null

  const module: NoteModuleDefinition = {
    id: createId('notemodule'),
    name,
    effects: effects.filter((effect) => selected.has(effect.id)),
    knobs: [],
  }
  const use = createNoteModuleUse(module)
  const first = effects.findIndex((effect) => selected.has(effect.id))
  const rest = effects.filter((effect) => !selected.has(effect.id))
  return { module, use, effects: [...rest.slice(0, first), use, ...rest.slice(first)] }
}

/** A new use of a module, with every knob at the value stored in the definition. */
export const createNoteModuleUse = (definition: NoteModuleDefinition): NoteEffect => ({
  id: createId('fx'),
  type: NOTE_MODULE_TYPE,
  moduleId: definition.id,
  params: {},
  bypassed: false,
})

/** Keeps `knobs` pointing only at effects and parameters that still exist inside the module. */
export const pruneNoteModuleKnobs = (definition: NoteModuleDefinition, modules: NoteModuleLibrary): NoteModuleDefinition => {
  const valid = (knob: NoteModuleKnob) => {
    const effect = definition.effects.find((candidate) => candidate.id === knob.effect)
    return Boolean(effect && describeNoteEffect(effect, modules)?.params.some((spec) => spec.id === knob.param))
  }
  const knobs = definition.knobs.filter(valid)
  return knobs.length === definition.knobs.length ? definition : { ...definition, knobs }
}

/**
 * Drops knob values on module uses for knobs the definition no longer has, and unknown module uses' params.
 * Returns the same chain when nothing needed fixing.
 */
export const pruneNoteModuleUses = (effects: readonly NoteEffect[], modules: NoteModuleLibrary): readonly NoteEffect[] => {
  let changed = false
  const next = effects.map((effect) => {
    if (effect.type !== NOTE_MODULE_TYPE) return effect
    const valid = new Set(findNoteModule(modules, effect.moduleId)?.knobs.map((knob) => knob.id))
    const stale = Object.keys(effect.params).filter((id) => !valid.has(id))
    if (stale.length === 0) return effect
    changed = true
    return { ...effect, params: Object.fromEntries(Object.entries(effect.params).filter(([id]) => valid.has(id))) }
  })
  return changed ? next : effects
}
