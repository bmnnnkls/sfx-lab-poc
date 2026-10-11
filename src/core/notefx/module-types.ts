import type { NoteEffect } from './types'

/** The effect type of a use of a MIDI effect module in a chain; every other type comes from the registry. */
export const NOTE_MODULE_TYPE = 'module'

/** A parameter of one of the module's effects, shown as a knob on every use of the module. */
export interface NoteModuleKnob {
  /** Stable id: `knobId(effect, param)`. */
  readonly id: string
  readonly label: string
  readonly effect: string
  readonly param: string
}

/**
 * A reusable chain of MIDI effects: one definition, any number of uses, so editing it changes every use. A use
 * is a `NoteEffect` of type `module` with `moduleId`. Chains are linear (notes in, notes out), so a module
 * needs no ports, only the knobs it chooses to show.
 */
export interface NoteModuleDefinition {
  readonly id: string
  readonly name: string
  readonly effects: readonly NoteEffect[]
  readonly knobs: readonly NoteModuleKnob[]
}

export type NoteModuleLibrary = readonly NoteModuleDefinition[]

export const noteKnobId = (effectId: string, paramId: string): string => `${effectId}:${paramId}`
