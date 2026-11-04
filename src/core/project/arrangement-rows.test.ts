import { describe, expect, it } from 'vitest'
import { addTrack, createAudioTrack, createDemoProject, createReturnTrack, createTrack } from './index'
import { arrangementRows } from './arrangement-rows'
import { groupTrack, moveTrack, setGroupCollapsed, setGroupColour, setTrackHidden } from './track-groups'
import type { Project } from './types'

/** Tracks A, B and an audio track C, a return R, and no groups. */
const fixture = (): Project => {
  let project: Project = { ...createDemoProject(), tracks: [] }
  for (const name of ['A', 'B']) project = addTrack(project, { ...createTrack(name, 4), id: name })
  project = addTrack(project, { ...createReturnTrack('R'), id: 'R' })
  return addTrack(project, { ...createAudioTrack('C', 4), id: 'C' })
}

/** The rows as text: a group as `[name`, a track with its stripe after a slash. */
const outline = (project: Project) =>
  arrangementRows(project).map((row) => '  '.repeat(row.depth) + (row.kind === 'group' ? `[${row.group.name}` : `${row.track.name}${row.stripe ? `/${row.stripe}` : ''}`))

describe('arrangementRows', () => {
  it('lists the clip tracks, leaving out the returns', () => {
    expect(outline(fixture())).toEqual(['A', 'B', 'C'])
  })

  it('puts a group before its members, which carry its colour; a nested group its own', () => {
    const outer = groupTrack(fixture(), 'A')
    let project = setGroupColour(outer.project, outer.groupId!, 'teal')
    project = moveTrack(project, 'B', { inside: outer.groupId! })
    const inner = groupTrack(project, 'B')
    project = setGroupColour(inner.project, inner.groupId!, 'pink')
    const names = project.groups!.map((group) => group.name)
    expect(outline(project)).toEqual([`[${names[0]}`, '  A/teal', `  [${names[1]}`, '    B/pink', 'C'])
  })

  it('leaves out hidden tracks and what is inside a collapsed group', () => {
    const grouped = groupTrack(fixture(), 'A')
    expect(outline(setTrackHidden(grouped.project, 'C', true))).toEqual([`[${grouped.project.groups![0]!.name}`, '  A/' + grouped.project.groups![0]!.colour, 'B'])
    expect(outline(setGroupCollapsed(grouped.project, grouped.groupId!, true))).toEqual([`[${grouped.project.groups![0]!.name}`, 'B', 'C'])
  })

  it('is the same array while the tracks and groups are', () => {
    const project = fixture()
    expect(arrangementRows({ ...project, tempo: 99 })).toBe(arrangementRows(project))
  })
})
