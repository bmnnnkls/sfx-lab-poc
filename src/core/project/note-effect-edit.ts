import {
  appendNewNoteEffect,
  moveNoteEffectIn,
  removeNoteEffectFrom,
  setNoteEffectBypassedIn,
  setNoteEffectParamIn,
} from '../notefx'
import { editNoteChain } from './note-module-edit'
import type { Project } from './types'

/** Edits of a track's MIDI effect chain by track id (see `editNoteChain` for chains inside modules). */

/** Appends a MIDI effect of `type` to the end of a track's chain. */
export const addNoteEffect = (project: Project, trackId: string, type: string): Project =>
  editNoteChain(project, { trackId }, (effects) => appendNewNoteEffect(effects, type))

export const removeNoteEffect = (project: Project, trackId: string, effectId: string): Project =>
  editNoteChain(project, { trackId }, (effects) => removeNoteEffectFrom(effects, effectId))

/** Moves an effect `delta` places along the chain (negative = earlier). */
export const moveNoteEffect = (project: Project, trackId: string, effectId: string, delta: number): Project =>
  editNoteChain(project, { trackId }, (effects) => moveNoteEffectIn(effects, effectId, delta))

export const setNoteEffectParam = (project: Project, trackId: string, effectId: string, paramId: string, value: number): Project =>
  editNoteChain(project, { trackId }, (effects, modules) => setNoteEffectParamIn(effects, effectId, paramId, value, modules))

export const setNoteEffectBypassed = (project: Project, trackId: string, effectId: string, bypassed: boolean): Project =>
  editNoteChain(project, { trackId }, (effects) => setNoteEffectBypassedIn(effects, effectId, bypassed))
