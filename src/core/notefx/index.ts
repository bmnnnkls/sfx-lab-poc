export type { NoteEffect, NoteEffectDefinition, NoteProcessor } from './types'
export {
  NOTE_MODULE_TYPE,
  type NoteModuleDefinition,
  type NoteModuleKnob,
  type NoteModuleLibrary,
  noteKnobId,
} from './module-types'
export { type NoteEffectShape, describeNoteEffect, findNoteModule } from './effect-shape'
export {
  containsNoteModule,
  expandNoteModuleUse,
  flattenNoteEffects,
  noteModulesUsedBy,
  unlinkNoteModuleUse,
} from './flatten'
export {
  type NoteGroupResult,
  createNoteModuleUse,
  groupIntoNoteModule,
  isContiguous,
  pruneNoteModuleKnobs,
  pruneNoteModuleUses,
} from './group'
export {
  MAX_NOTE_EFFECTS,
  appendNewNoteEffect,
  exposeNoteKnob,
  hideNoteKnob,
  labelNoteKnob,
  moveNoteEffectIn,
  removeNoteEffectFrom,
  renameNoteModule,
  setNoteEffectBypassedIn,
  setNoteEffectParamIn,
  setNoteModuleEffects,
} from './chain-edit'
export { noteEffectDefinitions, findNoteEffect } from './registry'
export { NoteChain } from './chain'
export { CHORDS, SCALES, snapToScale } from './effects'
export { arpSequence } from './arpeggiator'
export { createNoteEffect } from './create'
