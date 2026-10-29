import { createDefaultGroupGraph } from '../patch'
import { clamp } from '../shared'
import { hasMixLoop, mixesAfter } from './mix-order'
import { findGroup, updateGroup } from './track-groups'
import type { GroupBus, Project, TrackGroup } from './types'

/** The bus a group gets when it starts summing its tracks: at unity, its sum straight through, nothing sent. */
export const createGroupBus = (): GroupBus => ({ volume: 1, fx: createDefaultGroupGraph(), sends: {} })

/** `value` without `key`; `value` itself when it has none. */
const withoutKey = <T extends object>(value: T, key: string): T => {
  if (!(key in value)) return value
  const { [key]: _gone, ...rest } = value as Record<string, unknown>
  return rest as T
}

const updateBus = (project: Project, groupId: string, change: (bus: GroupBus) => GroupBus): Project =>
  updateGroup(project, groupId, (group) => {
    if (!group.bus) return group
    const bus = change(group.bus)
    return bus === group.bus ? group : { ...group, bus }
  })

/**
 * Makes a group sum its tracks into a bus, or back into a folder: its members then go to the next bus out, or the
 * master. Off drops the bus with its effects (undo brings them back). Refused when the mix would loop.
 */
export const setGroupBus = (project: Project, groupId: string, on: boolean): Project => {
  const next = updateGroup(project, groupId, (group) => (on ? (group.bus ? group : { ...group, bus: createGroupBus() }) : withoutKey(group, 'bus')))
  return next !== project && hasMixLoop(next) ? project : next
}

export const setGroupVolume = (project: Project, groupId: string, volume: number): Project => {
  const next = clamp(volume, 0, 1)
  return updateBus(project, groupId, (bus) => (bus.volume === next ? bus : { ...bus, volume: next }))
}

export const setGroupPan = (project: Project, groupId: string, pan: number): Project => {
  const next = clamp(pan, -1, 1)
  return updateBus(project, groupId, (bus) => {
    if ((bus.pan ?? 0) === next) return bus
    return next === 0 ? withoutKey(bus, 'pan') : { ...bus, pan: next }
  })
}

/**
 * How much of a bus, after its fader, goes to a return track, 0..1; 0 removes the entry. A target that is not a return
 * is ignored, and so is one the bus is mixed after (that would loop).
 */
export const setGroupSend = (project: Project, groupId: string, returnId: string, level: number): Project => {
  if (project.tracks.find((track) => track.id === returnId)?.kind !== 'return') return project
  if (mixesAfter(project, groupId, returnId)) return project
  const amount = clamp(level, 0, 1)
  return updateBus(project, groupId, (bus) => {
    if ((bus.sends[returnId] ?? 0) === amount) return bus
    return { ...bus, sends: amount === 0 ? withoutKey(bus.sends, returnId) : { ...bus.sends, [returnId]: amount } }
  })
}

const withFlag = (group: TrackGroup, key: 'muted' | 'soloed', on: boolean): TrackGroup => {
  if ((group[key] ?? false) === on) return group
  return on ? { ...group, [key]: true } : withoutKey(group, key)
}

/** Mutes every track in a group, a folder's as well as a bus's. */
export const setGroupMuted = (project: Project, groupId: string, muted: boolean): Project =>
  updateGroup(project, groupId, (group) => withFlag(group, 'muted', muted))

/** Solos every track in a group, and its bus. */
export const setGroupSoloed = (project: Project, groupId: string, soloed: boolean): Project =>
  updateGroup(project, groupId, (group) => withFlag(group, 'soloed', soloed))

/** A group's bus, or undefined for a folder or an unknown group. */
export const busOf = (project: Project, groupId: string): GroupBus | undefined => findGroup(project, groupId)?.bus
