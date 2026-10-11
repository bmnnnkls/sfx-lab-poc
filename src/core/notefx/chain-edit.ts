import { clamp } from '../shared'
import { createNoteEffect } from './create'
import { describeNoteEffect } from './effect-shape'
import { type NoteModuleDefinition, type NoteModuleLibrary, noteKnobId } from './module-types'
import type { NoteEffect } from './types'

/** Hard cap so a chain cannot grow without bound. */
export const MAX_NOTE_EFFECTS = 16

/** Pure edits of a chain of MIDI effects (a track's, or the inside of a module). Same array back when nothing changes. */

export const appendNoteEffect = (effects: readonly NoteEffect[], effect: NoteEffect | undefined): readonly NoteEffect[] =>
  effect && effects.length < MAX_NOTE_EFFECTS ? [...effects, effect] : effects

export const appendNewNoteEffect = (effects: readonly NoteEffect[], type: string): readonly NoteEffect[] =>
  appendNoteEffect(effects, createNoteEffect(type))

export const removeNoteEffectFrom = (effects: readonly NoteEffect[], id: string): readonly NoteEffect[] =>
  effects.some((effect) => effect.id === id) ? effects.filter((effect) => effect.id !== id) : effects

/** Moves an effect `delta` places along the chain (negative = earlier). */
export const moveNoteEffectIn = (effects: readonly NoteEffect[], id: string, delta: number): readonly NoteEffect[] => {
  const from = effects.findIndex((effect) => effect.id === id)
  const to = clamp(from + delta, 0, effects.length - 1)
  if (from === -1 || to === from) return effects
  const next = [...effects]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as NoteEffect)
  return next
}

/** Sets a parameter (or, on a module use, one of its knobs), clamped to the range of the parameter. */
export const setNoteEffectParamIn = (
  effects: readonly NoteEffect[],
  id: string,
  paramId: string,
  value: number,
  modules: NoteModuleLibrary = [],
): readonly NoteEffect[] => {
  const target = effects.find((effect) => effect.id === id)
  const spec = target && describeNoteEffect(target, modules)?.params.find((candidate) => candidate.id === paramId)
  if (!target || !spec) return effects
  const clamped = clamp(value, spec.min, spec.max)
  if (target.params[paramId] === clamped) return effects
  return effects.map((effect) => (effect === target ? { ...effect, params: { ...effect.params, [paramId]: clamped } } : effect))
}

export const setNoteEffectBypassedIn = (effects: readonly NoteEffect[], id: string, bypassed: boolean): readonly NoteEffect[] =>
  effects.some((effect) => effect.id === id && effect.bypassed !== bypassed)
    ? effects.map((effect) => (effect.id === id ? { ...effect, bypassed } : effect))
    : effects

// ---- a module's own interface

export const renameNoteModule = (definition: NoteModuleDefinition, name: string): NoteModuleDefinition =>
  name === definition.name ? definition : { ...definition, name }

export const setNoteModuleEffects = (definition: NoteModuleDefinition, effects: readonly NoteEffect[]): NoteModuleDefinition =>
  effects === definition.effects ? definition : { ...definition, effects }

export const exposeNoteKnob = (definition: NoteModuleDefinition, effect: string, param: string, label: string): NoteModuleDefinition => {
  const id = noteKnobId(effect, param)
  return definition.knobs.some((knob) => knob.id === id) ? definition : { ...definition, knobs: [...definition.knobs, { id, label, effect, param }] }
}

export const hideNoteKnob = (definition: NoteModuleDefinition, knobId: string): NoteModuleDefinition =>
  definition.knobs.some((knob) => knob.id === knobId) ? { ...definition, knobs: definition.knobs.filter((knob) => knob.id !== knobId) } : definition

export const labelNoteKnob = (definition: NoteModuleDefinition, knobId: string, label: string): NoteModuleDefinition => ({
  ...definition,
  knobs: definition.knobs.map((knob) => (knob.id === knobId ? { ...knob, label } : knob)),
})
