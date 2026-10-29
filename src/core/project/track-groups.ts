import { createId } from '../shared'
import { removeTrack } from './edit'
import { groupChain, groupsById } from './group-membership'
import { busGroups } from './group-routing'
import { hasMixLoop } from './mix-order'
import type { GroupColour, Project, Track, TrackGroup } from './types'

/** The most groups a project has, and how deep they nest (a top-level group is one level). */
export const MAX_GROUPS = 64
export const MAX_GROUP_DEPTH = 4

/** The colours a group can have, in the order new groups take them. */
export const GROUP_COLOURS: readonly GroupColour[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']

/** A track or a group, as a place to move something next to. */
export interface TrackItem {
  readonly kind: 'track' | 'group'
  readonly id: string
}

/** Where a track or a group goes: next to an item, at that item's level, or at the end of a group. */
export type TrackPlace = { readonly before: TrackItem } | { readonly after: TrackItem } | { readonly inside: string }

/**
 * What the views draw, depth first: a row per group, before its members, and per track. Clip tracks come first and
 * the returns after them, at depth 0. A top-level group or track is at depth 0, its members at 1.
 */
export type TrackRow =
  | { readonly kind: 'group'; readonly group: TrackGroup; readonly depth: number; readonly trackIds: readonly string[] }
  | { readonly kind: 'track'; readonly track: Track; readonly depth: number }

interface GroupNode {
  readonly kind: 'group'
  readonly group: TrackGroup
  readonly children: TreeNode[]
}
type TreeNode = GroupNode | { readonly kind: 'track'; readonly track: Track }

/**
 * The clip tracks as a tree, in the order of each group's first track, so members that are apart in `tracks` come
 * together. Groups without tracks don't appear. A fresh tree each call, so moves may change it.
 */
const treeOf = (project: Project): TreeNode[] => {
  const byId = groupsById(project)
  const roots: TreeNode[] = []
  const nodes = new Map<string, GroupNode>()
  for (const track of project.tracks) {
    if (track.kind === 'return') continue
    let children = roots
    for (const group of groupChain(byId, track.groupId)) {
      let node = nodes.get(group.id)
      if (!node) {
        node = { kind: 'group', group, children: [] }
        nodes.set(group.id, node)
        children.push(node)
      }
      children = node.children
    }
    children.push({ kind: 'track', track })
  }
  return roots
}

const itemOf = (node: TreeNode): TrackItem => (node.kind === 'track' ? { kind: 'track', id: node.track.id } : { kind: 'group', id: node.group.id })

/** The list holding `item` in the tree, and where. */
const locate = (nodes: TreeNode[], item: TrackItem): { list: TreeNode[]; index: number; node: TreeNode } | undefined => {
  for (const [index, node] of nodes.entries()) {
    const found = itemOf(node)
    if (found.kind === item.kind && found.id === item.id) return { list: nodes, index, node }
    if (node.kind === 'group') {
      const inner = locate(node.children, item)
      if (inner) return inner
    }
  }
  return undefined
}

/** `value` with `key` set to `next`, deleted for undefined; `value` itself when it already is. */
const withKey = <T extends object>(value: T, key: string, next: string | undefined): T => {
  const record = value as Record<string, unknown>
  if (record[key] === next) return value
  if (next !== undefined) return { ...value, [key]: next }
  const { [key]: _gone, ...rest } = record
  return rest as T
}

const sameItems = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((value, index) => value === b[index])

/**
 * The project laid out as `roots` says, with the returns in `returns`' order after the clip tracks. Each track's
 * `groupId` and each group's `parentId` follow the tree; groups left without tracks go. The same project when neither
 * order nor membership changed.
 */
const withTree = (project: Project, roots: readonly TreeNode[], returns: readonly Track[]): Project => {
  const clips: Track[] = []
  const groups: TrackGroup[] = []
  const walk = (nodes: readonly TreeNode[], parent: string | undefined): boolean => {
    let any = false
    for (const node of nodes) {
      if (node.kind === 'track') {
        clips.push(withKey(node.track, 'groupId', parent))
        any = true
        continue
      }
      const at = groups.length
      groups.push(withKey(node.group, 'parentId', parent))
      if (walk(node.children, node.group.id)) any = true
      else groups.splice(at, 1)
    }
    return any
  }
  walk(roots, undefined)
  // The groups keep their order in the file.
  const before = project.groups ?? []
  const ordered = before.flatMap((group) => groups.find((candidate) => candidate.id === group.id) ?? [])
  if (
    sameItems(ordered, before) &&
    sameItems(clips, project.tracks.filter((track) => track.kind !== 'return')) &&
    sameItems(returns, project.tracks.filter((track) => track.kind === 'return'))
  ) return project
  const { groups: _old, ...rest } = project
  return { ...rest, tracks: [...clips, ...returns], ...(ordered.length && { groups: ordered }) }
}

const returnsOf = (project: Project) => project.tracks.filter((track) => track.kind === 'return')

/** Members brought together and groups without tracks dropped (the sanitizer's repair); the same project when fine. */
export const normalizeTrackGroups = (project: Project): Project => withTree(project, treeOf(project), returnsOf(project))

const rowsCache = new WeakMap<readonly Track[], { readonly groups: Project['groups']; readonly rows: readonly TrackRow[] }>()

/** The project's rows; the same array while `tracks` and `groups` are. */
export const trackRows = (project: Project): readonly TrackRow[] => {
  const cached = rowsCache.get(project.tracks)
  if (cached && cached.groups === project.groups) return cached.rows
  const rows: TrackRow[] = []
  const idsIn = (nodes: readonly TreeNode[]): string[] => nodes.flatMap((node) => (node.kind === 'track' ? [node.track.id] : idsIn(node.children)))
  const walk = (nodes: readonly TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (node.kind === 'track') {
        rows.push({ kind: 'track', track: node.track, depth })
        continue
      }
      rows.push({ kind: 'group', group: node.group, depth, trackIds: idsIn(node.children) })
      walk(node.children, depth + 1)
    }
  }
  walk(treeOf(project), 0)
  for (const track of returnsOf(project)) rows.push({ kind: 'track', track, depth: 0 })
  rowsCache.set(project.tracks, { groups: project.groups, rows })
  return rows
}

const tracksCache = new WeakMap<readonly TrackRow[], readonly Track[]>()

/** Every track in the order the views draw them: the clip tracks, group by group, then the returns. */
export const tracksInOrder = (project: Project): readonly Track[] => {
  const rows = trackRows(project)
  let tracks = tracksCache.get(rows)
  if (!tracks) {
    tracks = rows.flatMap((row) => (row.kind === 'track' ? [row.track] : []))
    tracksCache.set(rows, tracks)
  }
  return tracks
}

const visibleCache = new WeakMap<readonly TrackRow[], readonly TrackRow[]>()

/** The rows the grid, the arrangement and the mixer draw: no hidden track, nothing inside a collapsed group, no group whose tracks are all hidden. */
export const visibleRows = (rows: readonly TrackRow[]): readonly TrackRow[] => {
  const cached = visibleCache.get(rows)
  if (cached) return cached
  const hidden = new Set(rows.flatMap((row) => (row.kind === 'track' && row.track.hidden ? [row.track.id] : [])))
  const visible: TrackRow[] = []
  // Rows deeper than this are inside a group that is collapsed or all hidden.
  let skipBelow = Infinity
  for (const row of rows) {
    if (row.depth > skipBelow) continue
    skipBelow = Infinity
    if (row.kind === 'track') {
      if (!row.track.hidden) visible.push(row)
    } else if (row.trackIds.every((id) => hidden.has(id))) {
      skipBelow = row.depth
    } else {
      visible.push(row)
      if (row.group.collapsed) skipBelow = row.depth
    }
  }
  visibleCache.set(rows, visible)
  return visible
}

export const findGroup = (project: Project, groupId: string): TrackGroup | undefined => project.groups?.find((group) => group.id === groupId)

/** The clip tracks in a group or in a group nested in it, in order. */
export const tracksInGroup = (project: Project, groupId: string): readonly Track[] => {
  const byId = groupsById(project)
  return project.tracks.filter((track) => track.kind !== 'return' && groupChain(byId, track.groupId).some((group) => group.id === groupId))
}

/** How many levels down a group is (1 at the top level), 0 for none. */
export const groupDepth = (project: Project, groupId: string | undefined): number => groupChain(groupsById(project), groupId).length

/** How many levels a group takes with the groups nested in it (1 with none), counted no further than a cycle could go. */
const heightOf = (project: Project, groupId: string, limit = MAX_GROUP_DEPTH + 1): number =>
  limit <= 0 ? 0 : 1 + Math.max(0, ...(project.groups ?? []).filter((group) => group.parentId === groupId).map((group) => heightOf(project, group.id, limit - 1)))

/** Whether the group `ancestorId`, or something in it, is `item`'s group or `item` itself. */
const within = (project: Project, item: TrackItem, ancestorId: string): boolean => {
  const byId = groupsById(project)
  const start = item.kind === 'group' ? item.id : project.tracks.find((track) => track.id === item.id)?.groupId
  return groupChain(byId, start).some((group) => group.id === ancestorId)
}

const trackOf = (project: Project, trackId: string) => project.tracks.find((track) => track.id === trackId)

/** Whether an item exists and is among the clip tracks (a group always is). */
const isClipItem = (project: Project, item: TrackItem): boolean => {
  if (item.kind === 'group') return trackRows(project).some((row) => row.kind === 'group' && row.group.id === item.id)
  const kind = trackOf(project, item.id)?.kind
  return kind !== undefined && kind !== 'return'
}

/** The group a place puts things in. */
const parentAt = (project: Project, place: TrackPlace): string | undefined => {
  if ('inside' in place) return place.inside
  const item = 'before' in place ? place.before : place.after
  return item.kind === 'group' ? findGroup(project, item.id)?.parentId : trackOf(project, item.id)?.groupId
}

const targetOf = (place: TrackPlace): TrackItem => ('inside' in place ? { kind: 'group', id: place.inside } : 'before' in place ? place.before : place.after)

/** Whether moving an item there would make the mix loop: it changes which bus sums what. */
const closesLoop = (project: Project, item: TrackItem, place: TrackPlace): boolean =>
  busGroups(project).length > 0 && hasMixLoop(moveInTree(project, item, place))

/**
 * Whether a track can go there: a clip track among the clip tracks and into any group, a return only next to another
 * return. Not next to itself, and not where its bus would make the mix loop.
 */
export const canMoveTrack = (project: Project, trackId: string, place: TrackPlace): boolean => {
  const track = trackOf(project, trackId)
  const target = targetOf(place)
  if (!track || (target.kind === 'track' && target.id === trackId)) return false
  if (track.kind === 'return') return target.kind === 'track' && !('inside' in place) && trackOf(project, target.id)?.kind === 'return'
  return isClipItem(project, target) && !closesLoop(project, { kind: 'track', id: trackId }, place)
}

/**
 * Whether a group can go there: among the clip tracks, not into itself, no deeper than `MAX_GROUP_DEPTH`, and not where
 * the mix would loop.
 */
export const canMoveGroup = (project: Project, groupId: string, place: TrackPlace): boolean => {
  const target = targetOf(place)
  if (!isClipItem(project, { kind: 'group', id: groupId }) || !isClipItem(project, target) || within(project, target, groupId)) return false
  return groupDepth(project, parentAt(project, place)) + heightOf(project, groupId) <= MAX_GROUP_DEPTH && !closesLoop(project, { kind: 'group', id: groupId }, place)
}

const moveInTree = (project: Project, item: TrackItem, place: TrackPlace): Project => {
  const roots = treeOf(project)
  const from = locate(roots, item)!
  from.list.splice(from.index, 1)
  if ('inside' in place) {
    const group = locate(roots, { kind: 'group', id: place.inside })!.node as GroupNode
    group.children.push(from.node)
  } else {
    const target = locate(roots, 'before' in place ? place.before : place.after)!
    target.list.splice(target.index + ('after' in place ? 1 : 0), 0, from.node)
  }
  return withTree(project, roots, returnsOf(project))
}

/** Moves a track; it joins the group of what it lands next to. A group it leaves empty goes. The same project when it can't. */
export const moveTrack = (project: Project, trackId: string, place: TrackPlace): Project => {
  if (!canMoveTrack(project, trackId, place)) return project
  const track = trackOf(project, trackId)!
  if (track.kind !== 'return') return moveInTree(project, { kind: 'track', id: trackId }, place)
  const returns = returnsOf(project).filter((candidate) => candidate !== track)
  const target = targetOf(place)
  returns.splice(returns.findIndex((candidate) => candidate.id === target.id) + ('after' in place ? 1 : 0), 0, track)
  return withTree(project, treeOf(project), returns)
}

/** Moves a group with everything in it. The same project when it can't. */
export const moveGroup = (project: Project, groupId: string, place: TrackPlace): Project =>
  canMoveGroup(project, groupId, place) ? moveInTree(project, { kind: 'group', id: groupId }, place) : project

/**
 * Where *Move up* (-1) or *Move down* (1) puts an item: before the previous item or after the next one at its level,
 * among the clip tracks or among the returns. Undefined at either end.
 */
export const neighbourPlace = (project: Project, item: TrackItem, direction: -1 | 1): TrackPlace | undefined => {
  const track = item.kind === 'track' ? trackOf(project, item.id) : undefined
  let siblings: readonly TrackItem[]
  if (track?.kind === 'return') siblings = returnsOf(project).map((candidate) => ({ kind: 'track', id: candidate.id }))
  else {
    const found = locate(treeOf(project), item)
    if (!found) return undefined
    siblings = found.list.map(itemOf)
  }
  const index = siblings.findIndex((sibling) => sibling.kind === item.kind && sibling.id === item.id)
  const neighbour = index < 0 ? undefined : siblings[index + direction]
  if (!neighbour) return undefined
  return direction < 0 ? { before: neighbour } : { after: neighbour }
}

/** Whether *Group* can make a group around this track: a clip track, below `MAX_GROUPS` and `MAX_GROUP_DEPTH`. */
export const canGroupTrack = (project: Project, trackId: string): boolean => {
  const track = trackOf(project, trackId)
  return !!track && track.kind !== 'return' && (project.groups?.length ?? 0) < MAX_GROUPS && groupDepth(project, track.groupId) < MAX_GROUP_DEPTH
}

/** A new group around a track, in the track's own group, named "Group *n*" in the next colour. */
export const groupTrack = (project: Project, trackId: string): { project: Project; groupId: string | null } => {
  if (!canGroupTrack(project, trackId)) return { project, groupId: null }
  const groups = project.groups ?? []
  const names = new Set(groups.map((group) => group.name))
  let number = groups.length + 1
  while (names.has(`Group ${number}`)) number++
  const track = trackOf(project, trackId)!
  const group: TrackGroup = {
    id: createId('group'),
    name: `Group ${number}`,
    colour: GROUP_COLOURS[groups.length % GROUP_COLOURS.length]!,
    ...(track.groupId !== undefined && { parentId: track.groupId }),
  }
  return {
    groupId: group.id,
    project: {
      ...project,
      groups: [...groups, group],
      tracks: project.tracks.map((candidate) => (candidate === track ? { ...candidate, groupId: group.id } : candidate)),
    },
  }
}

/** Removes a group and keeps what was in it, one level up, where it is. */
export const ungroup = (project: Project, groupId: string): Project => {
  const group = findGroup(project, groupId)
  if (!group) return project
  const groups = project.groups!.filter((candidate) => candidate !== group).map((candidate) => (candidate.parentId === groupId ? withKey(candidate, 'parentId', group.parentId) : candidate))
  const tracks = project.tracks.map((track) => (track.groupId === groupId ? withKey(track, 'groupId', group.parentId) : track))
  const { groups: _old, ...rest } = project
  return { ...rest, tracks, ...(groups.length && { groups }) }
}

/** Removes a group with its nested groups and their tracks, as `removeTrack` removes each. */
export const removeGroup = (project: Project, groupId: string): Project =>
  tracksInGroup(project, groupId).reduce((next, track) => removeTrack(next, track.id), project)

/** `change` applied to one group; the same project when it returns the same group. */
export const updateGroup = (project: Project, groupId: string, change: (group: TrackGroup) => TrackGroup): Project => {
  if (!project.groups) return project
  const groups = project.groups.map((group) => (group.id === groupId ? change(group) : group))
  return sameItems(groups, project.groups) ? project : { ...project, groups }
}

export const setGroupColour = (project: Project, groupId: string, colour: GroupColour): Project =>
  GROUP_COLOURS.includes(colour) ? updateGroup(project, groupId, (group) => (group.colour === colour ? group : { ...group, colour })) : project

const flag = <T extends { readonly collapsed?: boolean; readonly hidden?: boolean }>(value: T, key: 'collapsed' | 'hidden', on: boolean): T => {
  if ((value[key] ?? false) === on) return value
  if (on) return { ...value, [key]: true }
  const { [key]: _gone, ...rest } = value
  return rest as T
}

/** Folds a group away in every view, or unfolds it. A view edit: saved, not an undo step. */
export const setGroupCollapsed = (project: Project, groupId: string, collapsed: boolean): Project =>
  updateGroup(project, groupId, (group) => flag(group, 'collapsed', collapsed))

const updateTracks = (project: Project, change: (track: Track) => Track): Project => {
  const tracks = project.tracks.map(change)
  return sameItems(tracks, project.tracks) ? project : { ...project, tracks }
}

/** Hides a track from the grid, the arrangement and the mixer, or shows it. A view edit: saved, not an undo step. */
export const setTrackHidden = (project: Project, trackId: string, hidden: boolean): Project =>
  updateTracks(project, (track) => (track.id === trackId ? flag(track, 'hidden', hidden) : track))

/** Hides or shows every track in a group. */
export const setGroupHidden = (project: Project, groupId: string, hidden: boolean): Project => {
  const ids = new Set(tracksInGroup(project, groupId).map((track) => track.id))
  return updateTracks(project, (track) => (ids.has(track.id) ? flag(track, 'hidden', hidden) : track))
}

/** Shows every hidden track. */
export const showAllTracks = (project: Project): Project => updateTracks(project, (track) => flag(track, 'hidden', false))

/**
 * `restored` (a project undo or redo brings back) with what `current` shows: the collapsed flag of every group and the
 * hidden flag of every track that both have. Those are view fields, which undo doesn't change. `restored` itself when
 * nothing differs.
 */
export const withViewOf = (restored: Project, current: Project): Project => {
  const groups = new Map((current.groups ?? []).map((group) => [group.id, group]))
  const tracks = new Map(current.tracks.map((track) => [track.id, track]))
  const shown = updateTracks(restored, (track) => {
    const now = tracks.get(track.id)
    return now ? flag(track, 'hidden', now.hidden ?? false) : track
  })
  if (!shown.groups) return shown
  const folded = shown.groups.map((group) => {
    const now = groups.get(group.id)
    return now ? flag(group, 'collapsed', now.collapsed ?? false) : group
  })
  return sameItems(folded, shown.groups) ? shown : { ...shown, groups: folded }
}
