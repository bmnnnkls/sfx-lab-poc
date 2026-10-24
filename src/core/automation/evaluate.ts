import { controlFromNormalized, projectWithControlValues, resolveControlTarget } from '../control'
import { flattenPatch } from '../patch'
import type { Project } from '../project'
import { automationOwnerKey } from './edit'
import type { AutomationLane, AutomationTrack } from './types'

/** Pure musical-time evaluator: hold outside points, with no implicit interpolation across wrap. */
export const automationPosition = (lane: AutomationLane, beat: number, discrete = false): number | undefined => {
  if (!lane.enabled || !lane.points.length || !Number.isFinite(beat)) return undefined
  const points = lane.points
  let lo = 0, hi = points.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid]!.beat <= beat + 1e-10) lo = mid + 1; else hi = mid }
  const a = points[Math.max(0, lo - 1)]!, b = points[lo]
  if (!b || beat <= a.beat || discrete || a.interpolation === 'hold') return a.value
  return a.value + (b.value - a.value) * Math.max(0, Math.min(1, (beat - a.beat) / (b.beat - a.beat)))
}
export const automationValue = (lane: Parameters<typeof automationPosition>[0] & { spec: Parameters<typeof controlFromNormalized>[0]; discrete: boolean }, beat: number): number | undefined => {
  const position = automationPosition(lane, beat, lane.discrete)
  return position === undefined ? undefined : controlFromNormalized(lane.spec, position)
}
const compileLanes = (project: Project, lanes: readonly AutomationLane[], owner: import('../control').ControlOwner) => lanes.flatMap((lane) => {
  const resolved = resolveControlTarget(project, lane.target)
  return automationOwnerKey(lane.target.owner) === automationOwnerKey(owner) && resolved.status === 'available' && resolved.automatable
    ? [{ ...lane, spec: resolved.spec, baseValue: resolved.baseValue, discrete: resolved.interpolation === 'hold' }] : []
})
export const compileAutomation = (project: Project): AutomationTrack[] => [
  ...project.tracks.map((track): AutomationTrack => {
    const slots = track.kind === 'return' ? track.automationSlots ?? [] : track.clips
    const owner = { kind: 'track' as const, trackId: track.id }
    return { trackId: track.id, ...(track.kind === 'return' && { slotOwner: owner }),
      ...(track.kind === 'instrument' && track.clips.some((clip) => clip?.automation?.some((lane) => lane.target.kind === 'graph' && lane.target.domain === 'notes')) && { noteGraph: flattenPatch((projectWithControlValues(project).tracks.find((t) => t.id === track.id) as typeof track).noteGraph, project.modules) }),
      clips: slots.map((clip) => !clip ? null : { id: clip.id, lengthBeats: clip.lengthBeats, lanes: compileLanes(project, clip.automation ?? [], owner) }),
    }
  }),
  { trackId: '', slotOwner: { kind: 'master' as const }, clips: (project.master.automationSlots ?? []).map((slot) => !slot ? null : { id: slot.id, lengthBeats: slot.lengthBeats, lanes: compileLanes(project, slot.automation ?? [], { kind: 'master' }) }) },
].filter((track) => track.slotOwner ? track.clips.some(Boolean) : track.clips.some((clip) => clip?.lanes.length))
