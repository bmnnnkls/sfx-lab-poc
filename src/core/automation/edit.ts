import { type ControlRemap, controlTargetKey, remapControlTarget } from '../control'
import type { AudioClip, AutomationSlot, Clip, Project, Track } from '../project'
import { createId } from '../shared'
import { MAX_AUTOMATION_LANES, MAX_AUTOMATION_POINTS, type AutomationLane, type AutomationPoint } from './types'

/** Last input point wins equal times; IDs are unique and all numbers finite. Endpoints are retained. */
export const canonicalAutomationPoints = (points: readonly AutomationPoint[], length: number): AutomationPoint[] => {
  const times = new Map<number, AutomationPoint>(), ids = new Set<string>()
  for (const point of points.slice(0, MAX_AUTOMATION_POINTS)) {
    if (!Number.isFinite(point.beat) || !Number.isFinite(point.value) || point.beat < 0 || point.beat > length) continue
    if (ids.has(point.id)) continue
    ids.add(point.id)
    times.set(point.beat, { ...point, value: Math.max(0, Math.min(1, point.value)), interpolation: point.interpolation === 'hold' ? 'hold' : 'linear' })
  }
  return [...times.values()].sort((a, b) => a.beat - b.beat)
}
export const resizeAutomation = <C extends Clip | AudioClip | AutomationSlot>(clip: C, length: number): C => !clip.automation ? clip : ({ ...clip, automation: clip.automation.map((lane) => ({ ...lane, points: canonicalAutomationPoints(lane.points, length) })) })

/** Repeat with explicit hold/first-value boundaries; never invent a ramp between loop passes. */
export const doubleAutomation = (lanes: readonly AutomationLane[] | undefined, length: number): readonly AutomationLane[] | undefined => lanes?.map((lane) => {
  const first = lane.points[0], last = lane.points.at(-1)
  if (!first || !last) return lane
  // A boundary point at L belongs to the start of pass two. Retain the old left limit just before L.
  const epsilon = 1e-9
  const end = last.value
  const points: AutomationPoint[] = [
    ...lane.points.filter((p) => p.beat < length),
    { id: createId('point'), beat: length - epsilon, value: end, interpolation: 'hold' },
    { id: createId('point'), beat: length, value: first.value, interpolation: first.interpolation },
    ...lane.points.map((p) => ({ ...p, id: createId('point'), beat: p.beat + length })),
  ]
  return { ...lane, points: canonicalAutomationPoints(points, length * 2) }
})
export const duplicateAutomation = (lanes: readonly AutomationLane[] | undefined, remap: ControlRemap, destination: Project): readonly AutomationLane[] | undefined => lanes?.map((lane) => {
  const result = remapControlTarget(lane.target, remap, destination)
  return { ...lane, id: createId('lane'), target: result.status === 'mapped' ? result.target : lane.target, points: lane.points.map((p) => ({ ...p, id: createId('point') })) }
})
/** Clip lanes may address only their own owner. Missing references remain visible. */
export const setClipAutomation = (project: Project, trackId: string, clipId: string, lanes: readonly AutomationLane[]): Project => {
  const tracks = project.tracks.map((track): Track => {
    if (track.id !== trackId || track.kind === 'return') return track
    const clips = track.clips.map((clip) => {
      if (!clip || clip.id !== clipId) return clip
      const ids = new Set<string>()
      const automation = uniqueAutomationLanes(lanes).slice(0, MAX_AUTOMATION_LANES)
        .filter((lane) => automationTargetOwnedBy(lane.target, trackId) && !ids.has(lane.id) && Boolean(ids.add(lane.id)))
        .map((lane) => ({ ...lane, points: canonicalAutomationPoints(lane.points, clip.lengthBeats) }))
      return JSON.stringify(automation) === JSON.stringify(clip.automation ?? []) ? clip : { ...clip, automation }
    })
    return clips.every((clip, index) => clip === track.clips[index]) ? track : { ...track, clips } as Track
  })
  return tracks.every((track, index) => track === project.tracks[index]) ? project : { ...project, tracks }
}
export const automationTargetOwnedBy = (target: AutomationLane['target'], trackId: string): boolean => target.owner.kind === 'track' && target.owner.trackId === trackId
export const uniqueAutomationLanes = (lanes: readonly AutomationLane[]): readonly AutomationLane[] => [...new Map(lanes.map((lane) => [controlTargetKey(lane.target), lane])).values()]

/** Owner identity is structural; track IDs cannot collide with the master. */
export const automationOwnerKey = (owner: import('../control').ControlOwner): string => JSON.stringify(owner.kind === 'master' ? ['master'] : ['track', owner.trackId])
export const automationSlotsOf = (project: Project, owner: import('../control').ControlOwner) => owner.kind === 'master' ? project.master.automationSlots : project.tracks.filter((t) => t.kind === 'return').find((t) => t.id === owner.trackId)?.automationSlots
export const setAutomationSlot = (project: Project, owner: import('../control').ControlOwner, scene: number, slot: AutomationSlot | null): Project => {
  if (!Number.isInteger(scene) || scene < 0 || scene >= project.sceneCount || (slot && (!Number.isFinite(slot.lengthBeats) || slot.lengthBeats < 0.25 || slot.lengthBeats > 256))) return project
  const slots = Array.from({ length: project.sceneCount }, (_, i) => automationSlotsOf(project, owner)?.[i] ?? null)
  const automation = slot?.automation && uniqueAutomationLanes(slot.automation).slice(0, MAX_AUTOMATION_LANES).filter((l) => automationOwnerKey(l.target.owner) === automationOwnerKey(owner)).map((l) => ({ ...l, points: canonicalAutomationPoints(l.points, slot.lengthBeats) }))
  slots[scene] = slot ? { ...slot, ...(automation && { automation }) } : null
  if (JSON.stringify(slots) === JSON.stringify(automationSlotsOf(project, owner))) return project
  if (owner.kind === 'master') return { ...project, master: { ...project.master, automationSlots: slots } }
  const tracks = project.tracks.map((t) => t.id === owner.trackId && t.kind === 'return' ? { ...t, automationSlots: slots } : t)
  return tracks.every((t, i) => t === project.tracks[i]) ? project : { ...project, tracks }
}
