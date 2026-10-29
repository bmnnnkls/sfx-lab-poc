import { type ModuleLibrary, createDefaultGroupGraph } from '../patch'
import { GROUP_COLOURS, MAX_GROUP_DEPTH, NAME_LIMITS, type GroupBus, type GroupColour, type Project, type Track, type TrackGroup, normalizeTrackGroups } from '../project'
import { clamp } from '../shared'
import { LIMITS } from './format'
import { type Warn, asList, finiteNumber, isRecord, nonEmptyText } from './raw'
import { sanitizePatch } from './sanitize-patch'
import { readSends } from './sanitize-sends'

/** `value` without `key`. */
const without = <T extends object>(value: T, key: string): T => {
  const { [key]: _gone, ...rest } = value as Record<string, unknown>
  return rest as T
}

/**
 * A group's bus from untrusted data: the fader clamped (anything else is 1), pan finite and clamped, the graph through
 * `sanitizePatch` (none: the default, silently, as a track's) and the sends through `readSends`. Unknown fields go.
 */
const sanitizeBus = (raw: Record<string, unknown>, name: string, sampleIds: ReadonlySet<string>, modules: ModuleLibrary, warn: Warn): GroupBus => {
  const pan = clamp(finiteNumber(raw.pan, 0), -1, 1)
  return {
    volume: clamp(finiteNumber(raw.volume, 1), 0, 1),
    ...(pan !== 0 && { pan }),
    fx: isRecord(raw.fx) ? sanitizePatch(raw.fx, `Group "${name}" effects`, sampleIds, modules, warn) : createDefaultGroupGraph(),
    sends: readSends(raw.sends),
  }
}

/**
 * Reads `groups` and repairs what tracks say about them, each with a warning: a group without a usable id (or with a
 * track's or another group's) goes; an unknown colour becomes the first; a parent that is missing, closes a cycle or
 * nests past `MAX_GROUP_DEPTH` is cleared, so the group moves to the top level; a track's group that is missing, or on a
 * return, is cleared. Mute and solo count only as a real `true`; a bus keeps only the fields it knows.
 */
export const sanitizeGroups = (
  raw: unknown,
  tracks: readonly Track[],
  sampleIds: ReadonlySet<string>,
  modules: ModuleLibrary,
  warn: Warn,
): { tracks: Track[]; groups?: TrackGroup[] } => {
  const list = asList(raw)
  if (list.length > LIMITS.groups) warn(`Only the first ${LIMITS.groups} track groups were kept`)
  const trackIds = new Set(tracks.map((track) => track.id))
  const byId = new Map<string, TrackGroup>()
  for (const [index, entry] of list.slice(0, LIMITS.groups).entries()) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || trackIds.has(entry.id) || byId.has(entry.id)) {
      warn(`Track group ${index + 1}: dropped a group without an ID of its own`)
      continue
    }
    const name = nonEmptyText(entry.name, `Group ${index + 1}`, NAME_LIMITS.group)
    const colour = GROUP_COLOURS.includes(entry.colour as GroupColour) ? (entry.colour as GroupColour) : GROUP_COLOURS[0]!
    if (colour !== entry.colour) warn(`Track group "${name}": an unknown colour became ${colour}`)
    byId.set(entry.id, {
      id: entry.id,
      name,
      colour,
      ...(entry.collapsed === true && { collapsed: true }),
      ...(typeof entry.parentId === 'string' && { parentId: entry.parentId }),
      ...(entry.muted === true && { muted: true }),
      ...(entry.soloed === true && { soloed: true }),
      ...(isRecord(entry.bus) && { bus: sanitizeBus(entry.bus, name, sampleIds, modules, warn) }),
    })
  }

  // Parents: missing, cycles, then depth, walking each group's chain upwards.
  for (const group of byId.values()) {
    if (group.parentId !== undefined && !byId.has(group.parentId)) {
      warn(`Track group "${group.name}": its parent group is missing, so it moved to the top level`)
      byId.set(group.id, without(group, 'parentId'))
    }
  }
  for (const id of byId.keys()) {
    const seen: string[] = []
    for (let current = byId.get(id); current?.parentId !== undefined; current = byId.get(current.parentId)) {
      seen.push(current.id)
      if (seen.includes(current.parentId)) {
        warn(`Track group "${current.name}": its parent group is inside it, so it moved to the top level`)
        byId.set(current.id, without(current, 'parentId'))
        break
      }
    }
  }
  const depthOf = (group: TrackGroup): number => (group.parentId === undefined ? 1 : 1 + depthOf(byId.get(group.parentId)!))
  for (const group of byId.values()) {
    if (group.parentId !== undefined && depthOf(group) > MAX_GROUP_DEPTH) {
      warn(`Track group "${group.name}": nested deeper than ${MAX_GROUP_DEPTH} levels, so it moved to the top level`)
      byId.set(group.id, without(group, 'parentId'))
    }
  }

  const repaired = tracks.map((track) => {
    if (track.groupId === undefined) return track
    if (track.kind === 'return') warn(`Track "${track.name}": a return track can't be in a group, so it left it`)
    else if (!byId.has(track.groupId)) warn(`Track "${track.name}": its group is missing, so it left it`)
    else return track
    return without(track, 'groupId')
  })
  const groups = [...byId.values()]
  return { tracks: repaired, ...(groups.length && { groups }) }
}

/** Drops groups with no tracks and brings each group's tracks together, with a warning for each. */
export const repairGroupOrder = (project: Project, warn: Warn): Project => {
  const repaired = normalizeTrackGroups(project)
  if (repaired === project) return project
  for (const group of project.groups ?? []) {
    if (!repaired.groups?.some((kept) => kept.id === group.id)) warn(`Track group "${group.name}": dropped a group with no tracks`)
  }
  const clipOrder = (candidate: Project) => candidate.tracks.filter((track) => track.kind !== 'return').map((track) => track.id).join()
  if (clipOrder(repaired) !== clipOrder(project)) warn('Tracks of a group that were apart were moved together')
  return repaired
}
