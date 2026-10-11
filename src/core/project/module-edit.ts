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
import { mapModules, setTrackPatch } from './edit'
import type { Project } from './types'

/** Where a patch lives: an instrument track, or a module's inside. */
export type PatchTarget = { readonly trackId: string } | { readonly moduleId: string }

export const patchAt = (project: Project, target: PatchTarget): Patch | undefined => {
  if ('trackId' in target) {
    const track = project.tracks.find((candidate) => candidate.id === target.trackId)
    return track?.kind === 'instrument' ? track.patch : undefined
  }
  return project.modules.find((candidate) => candidate.id === target.moduleId)?.patch
}

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
      const patch = pruneModuleUses(module.patch, library)
      return pruneModuleInterface(patch === module.patch ? module : { ...module, patch }, library)
    })
    if (next === library) break
    modules = next
  }

  const tracks = project.tracks.map((track) => {
    if (track.kind !== 'instrument') return track
    const patch = pruneModuleUses(track.patch, modules)
    return patch === track.patch ? track : { ...track, patch }
  })
  const tracksSame = tracks.every((track, index) => track === project.tracks[index])
  return modules === project.modules && tracksSame ? project : { ...project, modules, ...(tracksSame ? {} : { tracks }) }
}

const setPatchAt = (project: Project, target: PatchTarget, patch: Patch): Project => {
  if ('trackId' in target) return reconcileModules(setTrackPatch(project, target.trackId, patch))
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

/** Turns a use into an independent copy of the module's contents; the definition and other uses are untouched. */
export const unlinkModuleNode = (project: Project, target: PatchTarget, nodeId: string): Project => {
  const patch = patchAt(project, target)
  return patch ? setPatchAt(project, target, unlinkModuleUse(patch, nodeId, project.modules)) : project
}

/** Everything that uses a module directly: how many times, and in which tracks and modules. */
export const moduleUsage = (project: Project, moduleId: string) => {
  const count = (patch: Patch) => patch.nodes.filter((node) => node.moduleId === moduleId).length
  const tracks = project.tracks.flatMap((track) => (track.kind === 'instrument' && count(track.patch) > 0 ? [track] : []))
  const modules = project.modules.filter((module) => module.id !== moduleId && count(module.patch) > 0)
  const uses =
    tracks.reduce((sum, track) => sum + (track.kind === 'instrument' ? count(track.patch) : 0), 0) +
    modules.reduce((sum, module) => sum + count(module.patch), 0)
  return { uses, tracks: tracks.map((track) => track.name), modules: modules.map((module) => module.name) }
}

/** Deletes a module nothing uses. Refuses (returns the project unchanged) while it is in use. */
export const removeModule = (project: Project, moduleId: string): Project =>
  moduleUsage(project, moduleId).uses > 0 || !project.modules.some((module) => module.id === moduleId)
    ? project
    : { ...project, modules: project.modules.filter((module) => module.id !== moduleId) }
