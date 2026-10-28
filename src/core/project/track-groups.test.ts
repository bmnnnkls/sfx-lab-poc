import { describe, expect, it } from 'vitest'
import { addTrack, createAudioTrack, createDemoProject, createReturnTrack, createTrack, removeTrack } from './index'
import { duplicateTrack } from './track-duplicate'
import {
  MAX_GROUP_DEPTH,
  canGroupTrack,
  canMoveGroup,
  canMoveTrack,
  groupTrack,
  moveGroup,
  moveTrack,
  neighbourPlace,
  normalizeTrackGroups,
  removeGroup,
  setGroupCollapsed,
  setGroupColour,
  setGroupHidden,
  setTrackHidden,
  showAllTracks,
  trackRows,
  tracksInGroup,
  tracksInOrder,
  ungroup,
  visibleRows,
  withViewOf,
} from './track-groups'
import type { Project, Track } from './types'

/** Tracks A to E with fixed ids, a return R placed between them in the file, and no groups. */
const fixture = (): Project => {
  let project: Project = { ...createDemoProject(), tracks: [] }
  for (const name of ['A', 'B', 'C']) project = addTrack(project, { ...createTrack(name, 4), id: name })
  project = addTrack(project, { ...createReturnTrack('R'), id: 'R' })
  project = addTrack(project, { ...createAudioTrack('D', 4), id: 'D' })
  project = addTrack(project, { ...createTrack('E', 4), id: 'E' })
  return addTrack(project, { ...createReturnTrack('S'), id: 'S' })
}

const track = (id: string) => ({ kind: 'track' as const, id })
const group = (id: string) => ({ kind: 'group' as const, id })
const names = (project: Project) => tracksInOrder(project).map((candidate) => candidate.name).join(' ')
/** The rows as text: a group as `[name`, nesting by indent. */
const outline = (project: Project) =>
  trackRows(project).map((row) => '  '.repeat(row.depth) + (row.kind === 'group' ? `[${row.group.name}` : row.track.name)).join('\n')

const grouped = (project: Project, trackId: string) => {
  const result = groupTrack(project, trackId)
  return { project: result.project, id: result.groupId! }
}

/** Every group's tracks sit together among the clip tracks, and every group has one. */
const checkInvariants = (project: Project) => {
  const clips = project.tracks.filter((candidate) => candidate.kind !== 'return')
  for (const candidate of project.groups ?? []) {
    const indices = tracksInGroup(project, candidate.id).map((member) => (clips as Track[]).indexOf(member))
    expect(indices.length, candidate.name).toBeGreaterThan(0)
    expect(indices[indices.length - 1]! - indices[0]!, candidate.name).toBe(indices.length - 1)
  }
  expect(project.tracks.filter((candidate) => candidate.kind === 'return' && candidate.groupId)).toEqual([])
}

describe('track rows', () => {
  it('lists the clip tracks in file order, then the returns, as the session grid did', () => {
    const project = fixture()
    expect(names(project)).toBe('A B C D E R S')
    expect(trackRows(project).every((row) => row.depth === 0)).toBe(true)
  })

  it('is the same array while tracks and groups are', () => {
    const project = fixture()
    expect(trackRows(project)).toBe(trackRows({ ...project }))
    expect(tracksInOrder(project)).toBe(tracksInOrder(project))
    expect(trackRows(setTrackHidden(project, 'A', true))).not.toBe(trackRows(project))
  })

  it('draws a group before its tracks, with their ids', () => {
    const { project } = grouped(fixture(), 'B')
    expect(outline(project)).toBe('A\n[Group 1\n  B\nC\nD\nE\nR\nS')
    expect(trackRows(project)[1]).toMatchObject({ kind: 'group', trackIds: ['B'] })
  })

  it('brings members that are apart together, in the order of the first one', () => {
    const { project, id } = grouped(fixture(), 'B')
    const split: Project = { ...project, tracks: project.tracks.map((candidate) => (candidate.id === 'E' ? { ...candidate, groupId: id } : candidate)) }
    expect(names(split)).toBe('A B E C D R S')
    const repaired = normalizeTrackGroups(split)
    checkInvariants(repaired)
    expect(repaired.tracks.map((candidate) => candidate.id)).toEqual(['A', 'B', 'E', 'C', 'D', 'R', 'S'])
    expect(normalizeTrackGroups(repaired)).toBe(repaired)
  })

  it('leaves out hidden tracks, collapsed members and all-hidden groups from the visible rows', () => {
    let { project, id } = grouped(fixture(), 'B')
    project = moveTrack(project, 'C', { inside: id })
    project = setTrackHidden(project, 'A', true)
    expect(visibleRows(trackRows(project)).map((row) => (row.kind === 'group' ? row.group.name : row.track.name))).toEqual(['Group 1', 'B', 'C', 'D', 'E', 'R', 'S'])
    const collapsed = setGroupCollapsed(project, id, true)
    expect(visibleRows(trackRows(collapsed)).map((row) => (row.kind === 'group' ? row.group.name : row.track.name))).toEqual(['Group 1', 'D', 'E', 'R', 'S'])
    const hidden = setGroupHidden(project, id, true)
    expect(visibleRows(trackRows(hidden)).map((row) => (row.kind === 'group' ? row.group.name : row.track.name))).toEqual(['D', 'E', 'R', 'S'])
  })
})

describe('grouping', () => {
  it('makes a group around a track, in its group, named and coloured in turn', () => {
    const first = grouped(fixture(), 'B')
    const second = grouped(first.project, 'B')
    expect(second.project.groups!.map((candidate) => [candidate.name, candidate.colour, candidate.parentId])).toEqual([
      ['Group 1', 'red', undefined],
      ['Group 2', 'orange', first.id],
    ])
    expect(outline(second.project)).toBe('A\n[Group 1\n  [Group 2\n    B\nC\nD\nE\nR\nS')
  })

  it('refuses a return and the depth limit', () => {
    let project = fixture()
    expect(canGroupTrack(project, 'R')).toBe(false)
    expect(groupTrack(project, 'R').project).toBe(project)
    for (let level = 0; level < MAX_GROUP_DEPTH; level++) project = grouped(project, 'A').project
    expect(canGroupTrack(project, 'A')).toBe(false)
  })

  it('ungroups in place, one level up', () => {
    const outer = grouped(fixture(), 'B')
    let project = moveTrack(outer.project, 'C', { inside: outer.id })
    const inner = grouped(project, 'C')
    project = ungroup(inner.project, outer.id)
    expect(outline(project)).toBe('A\nB\n[Group 2\n  C\nD\nE\nR\nS')
    expect(project.groups!.map((candidate) => candidate.parentId)).toEqual([undefined])
    expect(ungroup(project, inner.id).groups).toBeUndefined()
  })

  it('deletes a group with its nested groups and tracks', () => {
    const outer = grouped(fixture(), 'B')
    const project = grouped(moveTrack(outer.project, 'C', { inside: outer.id }), 'C').project
    const removed = removeGroup(project, outer.id)
    expect(names(removed)).toBe('A D E R S')
    expect(removed.groups).toBeUndefined()
  })

  it('drops a group when its last track is removed, and keeps a duplicate in its group', () => {
    const { project, id } = grouped(fixture(), 'B')
    expect(removeTrack(project, 'B').groups).toBeUndefined()
    const copy = duplicateTrack(project, 'B')
    expect(tracksInGroup(copy.project, id).map((candidate) => candidate.name)).toEqual(['B', 'B copy'])
  })

  it('renames nothing else and recolours only to a known colour', () => {
    const { project, id } = grouped(fixture(), 'A')
    expect(setGroupColour(project, id, 'blue').groups![0]!.colour).toBe('blue')
    expect(setGroupColour(project, id, 'beige' as never)).toBe(project)
    expect(setGroupColour(project, id, 'red')).toBe(project)
  })
})

describe('moving', () => {
  it('moves a track before or after another, joining its group', () => {
    const { project, id } = grouped(fixture(), 'B')
    expect(names(moveTrack(project, 'E', { before: track('A') }))).toBe('E A B C D R S')
    const joined = moveTrack(project, 'E', { after: track('B') })
    expect(outline(joined)).toBe('A\n[Group 1\n  B\n  E\nC\nD\nR\nS')
    expect(tracksInGroup(joined, id).map((candidate) => candidate.id)).toEqual(['B', 'E'])
  })

  it('moves a track into a group at its end, and out of it', () => {
    const { project, id } = grouped(fixture(), 'B')
    const inside = moveTrack(project, 'A', { inside: id })
    expect(outline(inside)).toBe('[Group 1\n  B\n  A\nC\nD\nE\nR\nS')
    const out = moveTrack(inside, 'A', { after: group(id) })
    expect(outline(out)).toBe('[Group 1\n  B\nA\nC\nD\nE\nR\nS')
    expect(out.tracks.find((candidate) => candidate.id === 'A')!.groupId).toBeUndefined()
  })

  it('drops a group its last track leaves', () => {
    const { project } = grouped(fixture(), 'B')
    expect(moveTrack(project, 'B', { before: track('A') }).groups).toBeUndefined()
  })

  it('keeps clip tracks and returns apart', () => {
    const project = fixture()
    expect(canMoveTrack(project, 'A', { after: track('R') })).toBe(false)
    expect(canMoveTrack(project, 'R', { before: track('A') })).toBe(false)
    expect(canMoveTrack(project, 'R', { after: track('S') })).toBe(true)
    expect(names(moveTrack(project, 'R', { after: track('S') }))).toBe('A B C D E S R')
    expect(canMoveTrack(project, 'A', { before: track('A') })).toBe(false)
    expect(moveTrack(project, 'A', { after: track('R') })).toBe(project)
  })

  it('moves a group with its tracks, and not into itself', () => {
    const outer = grouped(fixture(), 'B')
    let project = moveTrack(outer.project, 'C', { inside: outer.id })
    const inner = grouped(project, 'C')
    project = inner.project
    expect(names(moveGroup(project, outer.id, { after: track('E') }))).toBe('A D E B C R S')
    expect(canMoveGroup(project, outer.id, { inside: inner.id })).toBe(false)
    expect(canMoveGroup(project, outer.id, { before: track('C') })).toBe(false)
    expect(canMoveGroup(project, outer.id, { after: track('R') })).toBe(false)
    const lifted = moveGroup(project, inner.id, { before: track('A') })
    expect(outline(lifted)).toBe('[Group 2\n  C\nA\n[Group 1\n  B\nD\nE\nR\nS')
  })

  it('refuses a group that would nest too deep', () => {
    let project = fixture()
    const ids: string[] = []
    for (let level = 0; level < MAX_GROUP_DEPTH; level++) {
      const result = grouped(project, 'A')
      project = result.project
      ids.push(result.id)
    }
    const other = grouped(project, 'B')
    expect(canMoveGroup(other.project, other.id, { inside: ids[MAX_GROUP_DEPTH - 2]! })).toBe(true)
    expect(canMoveGroup(other.project, other.id, { inside: ids[MAX_GROUP_DEPTH - 1]! })).toBe(false)
  })

  it('is the same project for a move that changes nothing', () => {
    const { project, id } = grouped(fixture(), 'B')
    expect(moveTrack(project, 'B', { inside: id })).toBe(project)
    expect(moveTrack(project, 'A', { before: group(id) })).toBe(project)
  })

  it('keeps the invariants through many random moves', () => {
    let project = fixture()
    const ids = ['A', 'B', 'C', 'D', 'E']
    let seed = 7
    const random = (count: number) => {
      seed = (seed * 16807) % 2147483647
      return seed % count
    }
    for (let step = 0; step < 400; step++) {
      const groups = project.groups ?? []
      const choice = random(4)
      const items = [...ids.map(track), ...groups.map((candidate) => group(candidate.id))]
      const target = items[random(items.length)]!
      const places = [{ before: target }, { after: target }, ...(target.kind === 'group' ? [{ inside: target.id }] : [])]
      const place = places[random(places.length)]!
      if (choice === 0) project = grouped(project, ids[random(ids.length)]!).project
      else if (choice === 1 && groups.length) project = moveGroup(project, groups[random(groups.length)]!.id, place)
      else if (choice === 2 && groups.length && random(3) === 0) project = ungroup(project, groups[random(groups.length)]!.id)
      else project = moveTrack(project, ids[random(ids.length)]!, place)
      checkInvariants(project)
      expect(normalizeTrackGroups(project)).toBe(project)
      expect(new Set(project.tracks.map((candidate) => candidate.id)).size).toBe(7)
    }
  })
})

describe('move up and down', () => {
  it('goes before the previous item or after the next one at the same level', () => {
    const { project, id } = grouped(fixture(), 'B')
    expect(neighbourPlace(project, track('A'), -1)).toBeUndefined()
    expect(neighbourPlace(project, track('A'), 1)).toEqual({ after: group(id) })
    expect(neighbourPlace(project, track('B'), 1)).toBeUndefined()
    expect(neighbourPlace(project, group(id), -1)).toEqual({ before: track('A') })
    expect(neighbourPlace(project, track('S'), -1)).toEqual({ before: track('R') })
    expect(neighbourPlace(project, track('R'), -1)).toBeUndefined()
  })
})

describe('view fields', () => {
  it('saves collapse and hide only as a real true', () => {
    const { project, id } = grouped(fixture(), 'B')
    const collapsed = setGroupCollapsed(project, id, true)
    expect(collapsed.groups![0]!.collapsed).toBe(true)
    expect('collapsed' in setGroupCollapsed(collapsed, id, false).groups![0]!).toBe(false)
    expect(setGroupCollapsed(project, id, false)).toBe(project)
    const hidden = setTrackHidden(project, 'R', true)
    expect(hidden.tracks.find((candidate) => candidate.id === 'R')!.hidden).toBe(true)
    expect(showAllTracks(hidden).tracks.some((candidate: Track) => 'hidden' in candidate)).toBe(false)
  })

  it('carries what is showing onto a project undo brings back', () => {
    const { project, id } = grouped(fixture(), 'B')
    const edited = { ...project, name: 'Edited' }
    const now = setTrackHidden(setGroupCollapsed(edited, id, true), 'A', true)
    const restored = withViewOf(project, now)
    expect(restored.name).toBe(project.name)
    expect(restored.groups![0]!.collapsed).toBe(true)
    expect(restored.tracks.find((candidate) => candidate.id === 'A')!.hidden).toBe(true)
    expect(withViewOf(project, edited)).toBe(project)
    // A group undo brings back keeps its own flags.
    const before = setGroupCollapsed(project, id, true)
    expect(withViewOf(before, fixture()).groups![0]!.collapsed).toBe(true)
  })
})
