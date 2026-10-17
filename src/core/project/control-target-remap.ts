import type { ControlTarget, InstanceStep } from '../control'
import type { PatchTarget } from './module-edit'
import type { Project, Track } from './types'

/** Rewrite only the addressed graph scope, including every use when editing a shared definition. */
export const mapControlRoutesAt = (project: Project, scope: PatchTarget, rewrite: (route: readonly string[]) => readonly string[] | undefined, inserted?: InstanceStep): Project => {
  const mapEntry = <T extends { readonly target: ControlTarget }>(entry: T): T => {
    const target = entry.target
    if (target.kind !== 'graph') return entry
    let offset = 0
    if ('moduleId' in scope) {
      const index = target.path.findIndex((step) => step.moduleId === scope.moduleId)
      if (index < 0) return entry
      offset = index + 1
    } else if ('master' in scope) {
      if (target.owner.kind !== 'master' || target.domain !== 'fx') return entry
    } else if (target.owner.kind !== 'track' || target.owner.trackId !== scope.trackId || target.domain !== (scope.graph ?? 'patch')) return entry
    const tail = [...target.path.slice(offset).map((step) => step.nodeId), target.nodeId]
    const route = rewrite(tail)
    if (!route) return entry // Unaffected or unavailable; never guess by name/type/position.
    let path: readonly InstanceStep[]
    if (inserted) path = [...target.path.slice(0, offset), inserted, ...target.path.slice(offset)]
    else path = [...target.path.slice(0, offset), ...target.path.slice(offset + 1).map((step, index) => ({ ...step, nodeId: route[index] as string }))]
    const mapped: ControlTarget = { ...target, path, nodeId: route.at(-1) as string }
    return { ...entry, target: mapped }
  }
  return { ...project, tracks: project.tracks.map((track) => track.kind === 'return' ? track : { ...track, clips: track.clips.map((clip) => !clip?.automation ? clip : { ...clip, automation: clip.automation.map(mapEntry) }) } as Track), ...(project.controlValues && { controlValues: project.controlValues.map(mapEntry) }), ...(project.midiMappings && { midiMappings: project.midiMappings.map(mapEntry) }) }
}
