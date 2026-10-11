import { type NoteEffect, createNoteEffect, findNoteEffect } from '../notefx'
import { clamp } from '../shared'
import { updateInstrument } from './edit'
import type { InstrumentTrack, Project } from './types'

/** Hard cap so a chain cannot grow without bound. */
export const MAX_NOTE_EFFECTS = 16

const updateEffects = (
  project: Project,
  trackId: string,
  change: (effects: readonly NoteEffect[]) => readonly NoteEffect[],
): Project =>
  updateInstrument(project, trackId, (track: InstrumentTrack) => {
    const noteEffects = change(track.noteEffects)
    return noteEffects === track.noteEffects ? track : { ...track, noteEffects }
  })

/** Appends a MIDI effect of `type` to the end of a track's chain. */
export const addNoteEffect = (project: Project, trackId: string, type: string): Project => {
  const effect = createNoteEffect(type)
  return effect ? updateEffects(project, trackId, (effects) => (effects.length >= MAX_NOTE_EFFECTS ? effects : [...effects, effect])) : project
}

export const removeNoteEffect = (project: Project, trackId: string, effectId: string): Project =>
  updateEffects(project, trackId, (effects) =>
    effects.some((effect) => effect.id === effectId) ? effects.filter((effect) => effect.id !== effectId) : effects,
  )

/** Moves an effect `delta` places along the chain (negative = earlier). */
export const moveNoteEffect = (project: Project, trackId: string, effectId: string, delta: number): Project =>
  updateEffects(project, trackId, (effects) => {
    const from = effects.findIndex((effect) => effect.id === effectId)
    const to = clamp(from + delta, 0, effects.length - 1)
    if (from === -1 || to === from) return effects
    const next = [...effects]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved as NoteEffect)
    return next
  })

export const setNoteEffectParam = (
  project: Project,
  trackId: string,
  effectId: string,
  paramId: string,
  value: number,
): Project =>
  updateEffects(project, trackId, (effects) => {
    const target = effects.find((effect) => effect.id === effectId)
    const spec = target && findNoteEffect(target.type)?.params.find((candidate) => candidate.id === paramId)
    if (!target || !spec) return effects
    const clamped = clamp(value, spec.min, spec.max)
    if (target.params[paramId] === clamped) return effects
    return effects.map((effect) =>
      effect === target ? { ...effect, params: { ...effect.params, [paramId]: clamped } } : effect,
    )
  })

export const setNoteEffectBypassed = (project: Project, trackId: string, effectId: string, bypassed: boolean): Project =>
  updateEffects(project, trackId, (effects) =>
    effects.some((effect) => effect.id === effectId && effect.bypassed !== bypassed)
      ? effects.map((effect) => (effect.id === effectId ? { ...effect, bypassed } : effect))
      : effects,
  )
