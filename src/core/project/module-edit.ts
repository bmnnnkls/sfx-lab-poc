import {
  type ModuleDefinition,
  type Patch,
  containsModule,
  createModuleUse,
  groupIntoModule,
  pruneModuleInterface,
  pruneModuleUses,
  unlinkModuleUse,
} from '../patch'
import { mapMasterFx, mapModules, setTrackPatch, updateInstrument, updateTrack } from './edit'
import type { Project } from './types'

/**
 * Where a patch lives: an instrument track's sound patch (`graph` absent or 'patch'), a track's insert graph
 * (`graph: 'fx'`, every kind of track), an instrument track's note graph (`graph: 'notes'`), the master bus's graph
 * (`{ master: true }`), or a module's inside.
 */
export type TrackGraph = 'patch' | 'fx' | 'notes'

export type PatchTarget =
  | { readonly trackId: string; readonly graph?: TrackGraph }
  | { readonly master: true }
  | { readonly moduleId: string }

export const patchAt = (project: Project, target: PatchTarget): Patch | undefined => {
  if ('master' in target) return project.master.fx
  if ('trackId' in target) {
    const track = project.tracks.find((candidate) => candidate.id === target.trackId)
    if (target.graph === 'fx') return track?.fx
    if (track?.kind !== 'instrument') return undefined
    return target.graph === 'notes' ? track.noteGraph : track.patch
  }
  return project.modules.find((candidate) => candidate.id === target.moduleId)?.patch
}

/** A patch with everything that pointed at a vanished module port, knob or node removed: wires and knob values. */
const tidy = (patch: Patch, library: readonly ModuleDefinition[]): Patch => pruneModuleUses(patch, library)

/**
 * Brings everything that refers to a module's interface back in line after a definition changed: a module
 * that no longer has a port or knob loses the wires and values that pointed at it, in every track and in
 * other modules. Returns the same project when nothing needed fixing.
 */
export const reconcileModules = (project: Project): Project => {
  let modules = project.modules
  // A module's interface can depend on modules nested inside it, so settle until nothing moves.
  for (let pass = 0; pass <= modules.length; pass++) {
    const library = modules
    const next = mapModules(library, (module) => {
      const patch = tidy(module.patch, library)
      return pruneModuleInterface(patch === module.patch ? module : { ...module, patch }, library)
    })
    if (next === library) break
    modules = next
  }

  const tracks = project.tracks.map((track) => {
    const fx = tidy(track.fx, modules)
    const base = fx === track.fx ? track : { ...track, fx }
    if (base.kind !== 'instrument') return base
    const patch = tidy(base.patch, modules)
    const noteGraph = tidy(base.noteGraph, modules)
    return patch === base.patch && noteGraph === base.noteGraph ? base : { ...base, patch, noteGraph }
  })
  const tracksSame = tracks.every((track, index) => track === project.tracks[index])
  const master = mapMasterFx(project.master, (fx) => tidy(fx, modules))
  return modules === project.modules && tracksSame && master === project.master
    ? project
    : { ...project, modules, master, ...(tracksSame ? {} : { tracks }) }
}

const setPatchAt = (project: Project, target: PatchTarget, patch: Patch): Project => {
  if ('master' in target) return reconcileModules({ ...project, master: { ...project.master, fx: patch } })
  if ('trackId' in target) {
    return reconcileModules(
      target.graph === 'fx'
        ? updateTrack(project, target.trackId, (track) => (track.fx === patch ? track : { ...track, fx: patch }))
        : target.graph === 'notes'
          ? updateInstrument(project, target.trackId, (track) => (track.noteGraph === patch ? track : { ...track, noteGraph: patch }))
          : setTrackPatch(project, target.trackId, patch),
    )
  }
  return updateModule(project, target.moduleId, (module) => ({ ...module, patch }))
}

/** Changes a module definition (its inside or its interface); every use follows. */
export const updateModule = (
  project: Project,
  moduleId: string,
  change: (module: ModuleDefinition) => ModuleDefinition,
): Project => {
  const modules = mapModules(project.modules, (module) => (module.id === moduleId ? change(module) : module))
  return modules === project.modules ? project : reconcileModules({ ...project, modules })
}

/** Edits the patch at `target` with the project's module library in hand. */
export const editPatchAt = (
  project: Project,
  target: PatchTarget,
  change: (patch: Patch, modules: readonly ModuleDefinition[]) => Patch,
): Project => {
  const patch = patchAt(project, target)
  if (!patch) return project
  const next = change(patch, project.modules)
  return next === patch ? project : setPatchAt(project, target, next)
}

/** Replaces the selected nodes of a patch by one use of a new module (see `groupIntoModule`). */
export const groupNodesAsModule = (
  project: Project,
  target: PatchTarget,
  nodeIds: Iterable<string>,
  name = `Module ${project.modules.length + 1}`,
): Project => {
  const patch = patchAt(project, target)
  const result = patch && groupIntoModule(patch, nodeIds, name, project.modules)
  if (!result) return project
  const withModule = { ...project, modules: [...project.modules, result.module] }
  return setPatchAt(withModule, target, result.patch)
}

/** Puts a new use of a module into a patch. Refuses when that would make a module contain itself. */
export const addModuleUse = (project: Project, target: PatchTarget, moduleId: string, x: number, y: number): Project => {
  const definition = project.modules.find((candidate) => candidate.id === moduleId)
  const patch = patchAt(project, target)
  if (!definition || !patch) return project
  if ('moduleId' in target && containsModule(project.modules, moduleId, target.moduleId)) return project
  return setPatchAt(project, target, { ...patch, nodes: [...patch.nodes, createModuleUse(definition, x, y)] })
}

/**
 * Puts a use of an example module into a patch, first copying its definition into the project's library when it is not there yet
 * (one edit, so one undo step). A definition already in the library is used as it is, including any changes made to it.
 */
export const addExampleModuleUse = (project: Project, target: PatchTarget, example: ModuleDefinition, x: number, y: number): Project => {
  const installed = project.modules.some((candidate) => candidate.id === example.id) ? project : { ...project, modules: [...project.modules, example] }
  const next = addModuleUse(installed, target, example.id, x, y)
  // A use that was refused (the target is gone) must not leave the library changed either.
  return next === installed ? project : next
}

/** Turns a use into an independent copy of the module's contents; the definition and other uses are untouched. */
export const unlinkModuleNode = (project: Project, target: PatchTarget, nodeId: string): Project => {
  const patch = patchAt(project, target)
  return patch ? setPatchAt(project, target, unlinkModuleUse(patch, nodeId, project.modules)) : project
}

/** Everything that uses a module directly: how many times, and in which tracks and modules. */
export const moduleUsage = (project: Project, moduleId: string) => {
  const count = (patch: Patch) => patch.nodes.filter((node) => node.moduleId === moduleId).length
  const inTrack = (track: Project['tracks'][number]) =>
    count(track.fx) + (track.kind === 'instrument' ? count(track.patch) + count(track.noteGraph) : 0)
  const tracks = project.tracks.filter((track) => inTrack(track) > 0)
  const modules = project.modules.filter((module) => module.id !== moduleId && count(module.patch) > 0)
  const onMaster = count(project.master.fx)
  const uses =
    tracks.reduce((sum, track) => sum + inTrack(track), 0) +
    modules.reduce((sum, module) => sum + count(module.patch), 0) +
    onMaster
  return {
    uses,
    tracks: [...tracks.map((track) => track.name), ...(onMaster > 0 ? ['Master'] : [])],
    modules: modules.map((module) => module.name),
  }
}

/** Deletes a module nothing uses. Refuses (returns the project unchanged) while it is in use. */
export const removeModule = (project: Project, moduleId: string): Project =>
  moduleUsage(project, moduleId).uses > 0 || !project.modules.some((module) => module.id === moduleId)
    ? project
    : { ...project, modules: project.modules.filter((module) => module.id !== moduleId) }
