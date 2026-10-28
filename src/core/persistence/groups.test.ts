import { describe, expect, it } from 'vitest'
import { addTrack, createDemoProject, createReturnTrack, groupTrack, moveTrack, setGroupCollapsed, setTrackHidden, trackRows } from '../project'
import type { Project } from '../project'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

const envelope = (project: unknown, version = CURRENT_VERSION) => JSON.stringify({ format: 'sfx-lab-project', version, project })

/** The demo's three tracks (Bass, Lead, Pad) in a nested group, one collapsed, one hidden, and a return. */
const grouped = (): Project => {
  let project = addTrack(createDemoProject(), { ...createReturnTrack('Return A'), id: 'ret' })
  const [bass, lead] = project.tracks
  const outer = groupTrack(project, bass!.id)
  project = moveTrack(outer.project, lead!.id, { inside: outer.groupId! })
  const inner = groupTrack(project, lead!.id)
  return setTrackHidden(setGroupCollapsed(inner.project, inner.groupId!, true), 'ret', true)
}

/** A raw saved project: the demo's tracks with ids `t1`..`t3`, a return `r`, and the given groups and memberships. */
const raw = (groups: unknown, members: Record<string, unknown> = {}) => {
  const saved = JSON.parse(serializeProject(addTrack(createDemoProject(), createReturnTrack('Return A')))).project
  saved.tracks = saved.tracks.map((track: Record<string, unknown>, index: number) => {
    const id = index === 3 ? 'r' : `t${index + 1}`
    return { ...track, id, ...(members[id] !== undefined && { groupId: members[id] }) }
  })
  return envelope({ ...saved, groups })
}

const outline = (project: Project) =>
  trackRows(project).map((row) => '  '.repeat(row.depth) + (row.kind === 'group' ? `[${row.group.name}` : row.track.name)).join('\n')

describe('track groups in files', () => {
  it('keeps groups, collapse and hidden tracks through save and load', () => {
    const project = grouped()
    const result = parseOk(serializeProject(project))
    expect(result.warnings).toEqual([])
    expect(result.project).toEqual(project)
  })

  it('saves a project without groups without them, as version 10', () => {
    const text = serializeProject(createDemoProject())
    expect(JSON.parse(text).version).toBe(10)
    expect(text).not.toContain('"groups"')
    expect(text).not.toContain('"hidden"')
  })

  it('ignores groups and hidden tracks in an older file', () => {
    const text = raw([{ id: 'g', name: 'Old', colour: 'red' }], { t1: 'g' }).replace(`"version":${CURRENT_VERSION}`, '"version":9')
    const withHidden = JSON.parse(text)
    withHidden.project.tracks[0].hidden = true
    const result = parseOk(JSON.stringify(withHidden))
    expect(result.warnings).toEqual([])
    expect(result.project.groups).toBeUndefined()
    expect(result.project.tracks.some((track) => 'groupId' in track || 'hidden' in track)).toBe(false)
  })

  it('reads collapse and hidden only as a real true', () => {
    const text = JSON.parse(raw([{ id: 'g', name: 'G', colour: 'blue', collapsed: 'yes' }], { t1: 'g' }))
    text.project.tracks[1].hidden = 1
    const { project } = parseOk(JSON.stringify(text))
    expect(project.groups).toEqual([{ id: 'g', name: 'G', colour: 'blue' }])
    expect(project.tracks.some((track) => 'hidden' in track)).toBe(false)
  })

  it.each([
    ['a group without an id', [{ name: 'X', colour: 'red' }], {}, /without an ID/],
    ["a group with a track's id", [{ id: 't2', name: 'X', colour: 'red' }], { t1: 't2' }, /without an ID/],
    ['an unknown colour', [{ id: 'g', name: 'X', colour: 'beige' }], { t1: 'g' }, /unknown colour became red/],
    ['a missing parent', [{ id: 'g', name: 'X', colour: 'red', parentId: 'nope' }], { t1: 'g' }, /parent group is missing/],
    ['a track in a missing group', [], { t1: 'nope' }, /its group is missing/],
    ['a return in a group', [{ id: 'g', name: 'X', colour: 'red' }], { t1: 'g', r: 'g' }, /return track can't be in a group/],
    ['a group without tracks', [{ id: 'g', name: 'X', colour: 'red' }], {}, /no tracks/],
  ])('repairs %s with a warning', (_, groups, members, warning) => {
    const result = parseOk(raw(groups, members))
    expect(result.warnings.some((message) => warning.test(message))).toBe(true)
    const project = result.project
    expect(project.tracks.find((track) => track.id === 'r')!.groupId).toBeUndefined()
    expect(project.tracks.every((track) => track.groupId === undefined || project.groups?.some((group) => group.id === track.groupId))).toBe(true)
  })

  it('breaks a cycle of parents', () => {
    const result = parseOk(raw([
      { id: 'a', name: 'A', colour: 'red', parentId: 'b' },
      { id: 'b', name: 'B', colour: 'red', parentId: 'a' },
    ], { t1: 'a', t2: 'b' }))
    expect(result.warnings.some((message) => /inside it/.test(message))).toBe(true)
    expect(outline(result.project)).toBe('[B\n  [A\n    Bass\n  Lead\nPad\nReturn A')
  })

  it('moves a group nested too deep to the top level', () => {
    const groups = ['a', 'b', 'c', 'd', 'e'].map((id, index, ids) => ({ id, name: id.toUpperCase(), colour: 'red', ...(index && { parentId: ids[index - 1] }) }))
    const result = parseOk(raw(groups, { t1: 'e' }))
    expect(result.warnings.some((message) => /deeper than 4/.test(message))).toBe(true)
    expect(outline(result.project)).toBe('[E\n  Bass\nLead\nPad\nReturn A')
  })

  it('brings the tracks of a group together', () => {
    const result = parseOk(raw([{ id: 'g', name: 'G', colour: 'red' }], { t1: 'g', t3: 'g' }))
    expect(result.warnings).toEqual(['Tracks of a group that were apart were moved together'])
    expect(outline(result.project)).toBe('[G\n  Bass\n  Pad\nLead\nReturn A')
  })
})
