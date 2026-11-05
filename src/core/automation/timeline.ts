import type { ControlOwner, ControlTarget } from '../control'
import { MAX_TIMELINE_BEATS, type Project, type TimelineLanes } from '../project'
import { createId } from '../shared'
import { automationOwnerKey, canonicalAutomationPoints, uniqueAutomationLanes } from './edit'
import { MAX_AUTOMATION_LANES, type AutomationLane } from './types'

/**
 * Who may own lanes on the timeline: a track or a return that exists, the master, or a group that exists and has a
 * bus. A folder has nothing to automate. The sanitizer, the edits and touch ask this one predicate.
 */
export const timelineOwnerAllowed = (project: Pick<Project, 'tracks' | 'groups'>, owner: ControlOwner): boolean => {
  if (owner.kind === 'master') return true
  if (owner.kind === 'group') return !!project.groups?.some((group) => group.id === owner.groupId && group.bus)
  return project.tracks.some((track) => track.id === owner.trackId)
}

const sameOwner = (a: ControlOwner, b: ControlOwner) => automationOwnerKey(a) === automationOwnerKey(b)

/** The owner's entry on the timeline, if it has one. */
export const timelineEntryOf = (project: Pick<Project, 'arrangementAutomation'>, owner: ControlOwner): TimelineLanes | undefined =>
  project.arrangementAutomation?.find((entry) => sameOwner(entry.owner, owner))

/** The owner's timeline lanes; none when it has no entry. */
export const timelineLanesOf = (project: Pick<Project, 'arrangementAutomation'>, owner: ControlOwner): readonly AutomationLane[] =>
  timelineEntryOf(project, owner)?.lanes ?? []

/** Lanes as the timeline keeps them: the owner's own targets, one lane per target and id, at most 64, points canonical. */
export const canonicalTimelineLanes = (owner: ControlOwner, lanes: readonly AutomationLane[]): AutomationLane[] => {
  const ids = new Set<string>()
  return uniqueAutomationLanes(lanes)
    .filter((lane) => sameOwner(lane.target.owner, owner) && !ids.has(lane.id) && Boolean(ids.add(lane.id)))
    .slice(0, MAX_AUTOMATION_LANES)
    .map((lane) => ({ ...lane, points: canonicalAutomationPoints(lane.points, MAX_TIMELINE_BEATS) }))
}

/** Replaces or removes the owner's entry; an entry with no lanes that isn't open is dropped. */
const withEntry = (project: Project, owner: ControlOwner, change: (entry: TimelineLanes | undefined) => TimelineLanes | undefined): Project => {
  const entries = project.arrangementAutomation ?? []
  const index = entries.findIndex((entry) => sameOwner(entry.owner, owner))
  const before = index === -1 ? undefined : entries[index]
  let after = change(before)
  if (after && !after.lanes.length && !after.open) after = undefined
  if (after === before) return project
  const next = index === -1 ? (after ? [...entries, after] : entries) : after ? entries.map((entry, i) => (i === index ? after : entry)) : entries.filter((_, i) => i !== index)
  if (next === entries) return project
  if (!next.length) {
    const { arrangementAutomation: _gone, ...rest } = project
    return rest
  }
  return { ...project, arrangementAutomation: next }
}

/**
 * Sets an owner's timeline lanes, kept canonical. Refused (the same project) for an owner that may not have lanes;
 * the same project when nothing changes.
 */
export const setTimelineLanes = (project: Project, owner: ControlOwner, lanes: readonly AutomationLane[]): Project => {
  if (!timelineOwnerAllowed(project, owner)) return project
  const next = canonicalTimelineLanes(owner, lanes)
  return withEntry(project, owner, (entry) => {
    if (entry && JSON.stringify(entry.lanes) === JSON.stringify(next)) return entry
    return { ...(entry ?? { owner }), lanes: next }
  })
}

const withOpen = (project: Project, owner: ControlOwner, open: boolean): Project =>
  withEntry(project, owner, (entry) => {
    if ((entry?.open ?? false) === open) return entry
    if (open) return { ...(entry ?? { owner, lanes: [] }), open: true }
    if (!entry) return entry
    const { open: _closed, ...rest } = entry
    return rest
  })

/** Opens or closes the owner's lanes under its row: a view field, written without an undo step. */
export const setTimelineLanesOpen = (project: Project, owner: ControlOwner, open: boolean): Project =>
  open && !timelineOwnerAllowed(project, owner) ? project : withOpen(project, owner, open)

/** Whether the owner's lanes are shown under its row. */
export const timelineLanesOpen = (project: Pick<Project, 'arrangementAutomation'>, owner: ControlOwner): boolean => timelineEntryOf(project, owner)?.open === true

/** Carries the lanes twisties across undo and redo, as `withViewOf` carries a group's `collapsed`. */
export const withTimelineOpenOf = (restored: Project, current: Project): Project => {
  const owners = new Map<string, ControlOwner>()
  for (const entry of [...(restored.arrangementAutomation ?? []), ...(current.arrangementAutomation ?? [])]) owners.set(automationOwnerKey(entry.owner), entry.owner)
  let next = restored
  for (const owner of owners.values()) next = withOpen(next, owner, timelineLanesOpen(current, owner))
  return next
}

/** Drops the entries of owners `dropOwner` names and the lanes `dropLane` names; the same project when nothing goes. */
export const pruneTimelineLanes = (project: Project, dropOwner: (owner: ControlOwner) => boolean, dropLane: (target: ControlTarget) => boolean = () => false): Project => {
  const entries = project.arrangementAutomation
  if (!entries) return project
  let changed = false
  const next = entries.flatMap((entry): TimelineLanes[] => {
    if (dropOwner(entry.owner)) { changed = true; return [] }
    const lanes = entry.lanes.filter((lane) => !dropLane(lane.target))
    if (lanes.length === entry.lanes.length) return [entry]
    changed = true
    return lanes.length || entry.open ? [{ ...entry, lanes }] : []
  })
  if (!changed) return project
  if (!next.length) {
    const { arrangementAutomation: _gone, ...rest } = project
    return rest
  }
  return { ...project, arrangementAutomation: next }
}

/** The owner's lanes copied to another owner (a duplicated track): fresh lane and point ids, targets moved. */
export const copyTimelineLanes = (project: Project, from: ControlOwner, to: ControlOwner, moveTarget: (target: ControlTarget) => ControlTarget): Project => {
  const lanes = timelineLanesOf(project, from)
  if (!lanes.length) return project
  const copied = lanes.map((lane) => ({ ...lane, id: createId('lane'), target: moveTarget(lane.target), points: lane.points.map((point) => ({ ...point, id: createId('point') })) }))
  return withEntry(project, to, () => ({ owner: to, lanes: canonicalTimelineLanes(to, copied) }))
}
