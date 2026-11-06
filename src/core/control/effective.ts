import { projectWithSampleBindings } from '../preset'
import { flattenPatch, setNodeParam } from '../patch'
import type { Project } from '../project'
import { controlGraph, flatControlNodeId, resolveControlTarget } from './resolve'
import { controlTargetKey, type ControlValue } from './types'
import { clampControlValue } from './values'

export interface EffectiveControl extends ControlValue { readonly baseValue: number }
/** Only active overrides cross the readout boundary; no copy of all parameters per refresh. */
export const effectiveControlReadouts = (project: Project, overrides: readonly ControlValue[]): EffectiveControl[] => overrides.flatMap((entry) => {
  // Pitch bend, pressure and CC have no value in the project: an override of one goes to the engine only.
  if (entry.target.kind === 'expression') return []
  const resolved = resolveControlTarget(project, entry.target)
  return resolved.status === 'available' && resolved.automatable && Number.isFinite(entry.value)
    ? [{ target: entry.target, baseValue: resolved.baseValue, value: clampControlValue(resolved.spec, entry.value) }] : []
})

/** An ephemeral engine projection. Never pass this to history or persistence. */
export const projectWithControlValues = (project: Project, overrides: readonly ControlValue[] = []): Project => {
  const entries = new Map((project.controlValues ?? []).map((entry) => [controlTargetKey(entry.target), entry]))
  for (const entry of effectiveControlReadouts(project, overrides)) entries.set(controlTargetKey(entry.target), entry)
  let next = projectWithSampleBindings(project)
  for (const { target, value } of entries.values()) {
    if (target.kind === 'expression') continue
    const resolved = resolveControlTarget(project, target)
    if (resolved.status !== 'available') continue
    const clamped = clampControlValue(resolved.spec, value)
    if (target.kind === 'mixer') {
      if (target.owner.kind === 'master') next = { ...next, master: { ...next.master, volume: clamped } }
      else if (target.owner.kind === 'group') {
        const groupId = target.owner.groupId
        next = { ...next, groups: next.groups?.map((group) => group.id !== groupId || !group.bus ? group : { ...group, bus: target.control === 'volume' ? { ...group.bus, volume: clamped }
          : target.control === 'pan' ? { ...group.bus, pan: clamped }
          : { ...group.bus, sends: { ...group.bus.sends, [target.returnId]: clamped } } }) }
      } else {
        const trackId = target.owner.trackId
        next = { ...next, tracks: next.tracks.map((track) => track.id !== trackId ? track
          : target.control === 'volume' ? { ...track, volume: clamped }
          : target.control === 'pan' ? { ...track, pan: clamped }
          : track.kind !== 'return' ? { ...track, sends: { ...track.sends, [target.returnId]: clamped } } : track) }
      }
      continue
    }
    const graph = controlGraph(next, target.owner, target.domain)
    if (!graph) continue
    const patch = setNodeParam(flattenPatch(graph, project.modules), flatControlNodeId(target), target.paramId, clamped)
    if (target.owner.kind === 'master') next = { ...next, master: { ...next.master, fx: patch } }
    else if (target.owner.kind === 'group') {
      const groupId = target.owner.groupId
      next = { ...next, groups: next.groups?.map((group) => group.id !== groupId || !group.bus ? group : { ...group, bus: { ...group.bus, fx: patch } }) }
    } else {
      const trackId = target.owner.trackId
      next = { ...next, tracks: next.tracks.map((track) => track.id !== trackId ? track : target.domain === 'fx' ? { ...track, fx: patch }
        : track.kind !== 'instrument' ? track : target.domain === 'patch' ? { ...track, patch } : { ...track, noteGraph: patch }) }
    }
  }
  if (next === project) return project
  const { controlValues: _saved, ...projection } = next
  return projection
}

