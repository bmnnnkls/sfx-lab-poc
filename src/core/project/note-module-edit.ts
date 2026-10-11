import {
  type NoteEffect,
  type NoteModuleDefinition,
  containsNoteModule,
  createNoteModuleUse,
  groupIntoNoteModule,
  pruneNoteModuleKnobs,
  pruneNoteModuleUses,
  unlinkNoteModuleUse,
} from '../notefx'
import { updateInstrument } from './edit'
import type { InstrumentTrack, Project } from './types'

/** Where a chain of MIDI effects lives: an instrument track, or the inside of a MIDI effect module. */
export type NoteChainTarget = { readonly trackId: string } | { readonly noteModuleId: string }

type Chain = readonly NoteEffect[]
type ChainEdit = (effects: Chain, modules: readonly NoteModuleDefinition[]) => Chain

const mapNoteModules = (
  modules: readonly NoteModuleDefinition[],
  change: (module: NoteModuleDefinition) => NoteModuleDefinition,
): readonly NoteModuleDefinition[] => {
  const next = modules.map(change)
  return next.every((module, index) => module === modules[index]) ? modules : next
}

export const chainAt = (project: Project, target: NoteChainTarget): Chain | undefined => {
  if ('trackId' in target) {
    const track = project.tracks.find((candidate) => candidate.id === target.trackId)
    return track?.kind === 'instrument' ? track.noteEffects : undefined
  }
  return project.noteModules.find((candidate) => candidate.id === target.noteModuleId)?.effects
}

/**
 * Brings everything that refers to a module's knobs back in line after a definition changed: a module that no
 * longer has a knob loses the values that were stored for it, in every track and in other modules. Returns the same
 * project when nothing needed fixing.
 */
export const reconcileNoteModules = (project: Project): Project => {
  let modules = project.noteModules
  for (let pass = 0; pass <= modules.length; pass++) {
    const library = modules
    const next = mapNoteModules(library, (module) => {
      const effects = pruneNoteModuleUses(module.effects, library)
      return pruneNoteModuleKnobs(effects === module.effects ? module : { ...module, effects }, library)
    })
    if (next === library) break
    modules = next
  }

  const tracks = project.tracks.map((track) => {
    if (track.kind !== 'instrument') return track
    const noteEffects = pruneNoteModuleUses(track.noteEffects, modules)
    return noteEffects === track.noteEffects ? track : { ...track, noteEffects }
  })
  const tracksSame = tracks.every((track, index) => track === project.tracks[index])
  return modules === project.noteModules && tracksSame ? project : { ...project, noteModules: modules, ...(tracksSame ? {} : { tracks }) }
}

/** Changes a MIDI effect module (its chain or its knobs); every use follows. */
export const updateNoteModule = (
  project: Project,
  moduleId: string,
  change: (module: NoteModuleDefinition) => NoteModuleDefinition,
): Project => {
  const noteModules = mapNoteModules(project.noteModules, (module) => (module.id === moduleId ? change(module) : module))
  return noteModules === project.noteModules ? project : reconcileNoteModules({ ...project, noteModules })
}

const setChainAt = (project: Project, target: NoteChainTarget, effects: Chain): Project =>
  'trackId' in target
    ? reconcileNoteModules(
        updateInstrument(project, target.trackId, (track: InstrumentTrack) => (effects === track.noteEffects ? track : { ...track, noteEffects: effects })),
      )
    : updateNoteModule(project, target.noteModuleId, (module) => (effects === module.effects ? module : { ...module, effects }))

/** Edits the chain at `target` with the project's module library in hand. */
export const editNoteChain = (project: Project, target: NoteChainTarget, change: ChainEdit): Project => {
  const chain = chainAt(project, target)
  if (!chain) return project
  const next = change(chain, project.noteModules)
  return next === chain ? project : setChainAt(project, target, next)
}

/** Replaces a run of neighbouring effects by one use of a new module (see `groupIntoNoteModule`). */
export const groupEffectsAsModule = (
  project: Project,
  target: NoteChainTarget,
  ids: Iterable<string>,
  name = `MIDI module ${project.noteModules.length + 1}`,
): Project => {
  const chain = chainAt(project, target)
  const result = chain && groupIntoNoteModule(chain, ids, name)
  if (!result) return project
  return setChainAt({ ...project, noteModules: [...project.noteModules, result.module] }, target, result.effects)
}

/** Appends a use of a module to a chain. Refuses when that would make a module contain itself. */
export const addNoteModuleUse = (project: Project, target: NoteChainTarget, moduleId: string): Project => {
  const definition = project.noteModules.find((candidate) => candidate.id === moduleId)
  const chain = chainAt(project, target)
  if (!definition || !chain) return project
  if ('noteModuleId' in target && containsNoteModule(project.noteModules, moduleId, target.noteModuleId)) return project
  return setChainAt(project, target, [...chain, createNoteModuleUse(definition)])
}

/** Turns a use into an independent copy of the module's effects; the definition and other uses are untouched. */
export const unlinkNoteModule = (project: Project, target: NoteChainTarget, useId: string): Project => {
  const chain = chainAt(project, target)
  return chain ? setChainAt(project, target, unlinkNoteModuleUse(chain, useId, project.noteModules)) : project
}

/** Where a MIDI effect module is used directly: how many times, in which tracks and which other modules. */
export const noteModuleUsage = (project: Project, moduleId: string) => {
  const count = (effects: Chain) => effects.filter((effect) => effect.moduleId === moduleId).length
  const tracks = project.tracks.flatMap((track) => (track.kind === 'instrument' && count(track.noteEffects) > 0 ? [track] : []))
  const modules = project.noteModules.filter((module) => module.id !== moduleId && count(module.effects) > 0)
  const uses =
    tracks.reduce((sum, track) => sum + (track.kind === 'instrument' ? count(track.noteEffects) : 0), 0) +
    modules.reduce((sum, module) => sum + count(module.effects), 0)
  return { uses, tracks: tracks.map((track) => track.name), modules: modules.map((module) => module.name) }
}

/** Deletes a module nothing uses. Refuses (returns the project unchanged) while it is in use. */
export const removeNoteModule = (project: Project, moduleId: string): Project =>
  noteModuleUsage(project, moduleId).uses > 0 || !project.noteModules.some((module) => module.id === moduleId)
    ? project
    : { ...project, noteModules: project.noteModules.filter((module) => module.id !== moduleId) }
