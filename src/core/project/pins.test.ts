import { describe, expect, it } from 'vitest'
import { addTrack, createAudioTrack, createEmptyProject, createReturnTrack, removeTrack } from './edit'
import { createDemoProject } from './demo-project'
import { setGroupBus } from './group-bus'
import { MAX_PINS, type PanelPin, canPin, livePins, movePin, pinKey, pinPanel, pinTarget, pinnedGraph, setPinCollapsed, unpinPanel, withPinsOf } from './pins'
import { groupTrack, removeGroup, ungroup, withViewOf } from './track-groups'
import type { Project } from './types'

const track = (trackId: string, graph: PanelPin['graph'] = 'patch'): PanelPin => ({ owner: { kind: 'track', trackId }, graph })
const group = (groupId: string): PanelPin => ({ owner: { kind: 'group', groupId }, graph: 'fx' })
const master: PanelPin = { owner: { kind: 'master' }, graph: 'fx' }

/** The demo (Bass, Lead, Pad) with ids `bass`, `lead`, `pad`, an audio track `audio`, a return `ret`, and Bass in a bus group `drums`. */
const fixture = (): Project => {
  const demo = createDemoProject()
  const ids = ['bass', 'lead', 'pad']
  let project: Project = { ...demo, tracks: demo.tracks.map((candidate, index) => ({ ...candidate, id: ids[index]! })) }
  project = addTrack(project, { ...createAudioTrack('Audio', project.sceneCount), id: 'audio' })
  project = addTrack(project, { ...createReturnTrack('Return A'), id: 'ret' })
  const grouped = groupTrack(project, 'bass')
  const withId = { ...grouped.project, groups: grouped.project.groups!.map((candidate) => ({ ...candidate, id: 'drums' })), tracks: grouped.project.tracks.map((candidate) => (candidate.id === 'bass' ? { ...candidate, groupId: 'drums' } : candidate)) }
  return setGroupBus(withId, 'drums', true)
}

const keys = (project: Project) => livePins(project).map((entry) => entry.key)

describe('a pin', () => {
  it('is keyed as a graph is', () => {
    expect(pinKey(track('lead', 'notes'))).toBe('lead:notes')
    expect(pinKey(group('drums'))).toBe('drums:fx')
    expect(pinKey(master)).toBe('master:fx')
  })

  it('names its graph as the store edits it', () => {
    expect(pinTarget(track('lead', 'fx'))).toEqual({ trackId: 'lead', graph: 'fx' })
    expect(pinTarget(group('drums'))).toEqual({ groupId: 'drums' })
    expect(pinTarget(master)).toEqual({ master: true })
  })

  it('finds the graph of every owner kind that has it', () => {
    const project = fixture()
    const lead = project.tracks.find((candidate) => candidate.id === 'lead')!
    if (lead.kind !== 'instrument') throw new Error('Lead is an instrument')
    expect(pinnedGraph(project, track('lead'))).toBe(lead.patch)
    expect(pinnedGraph(project, track('lead', 'notes'))).toBe(lead.noteGraph)
    expect(pinnedGraph(project, track('lead', 'fx'))).toBe(lead.fx)
    expect(pinnedGraph(project, track('audio', 'fx'))).toBeDefined()
    expect(pinnedGraph(project, track('ret', 'fx'))).toBeDefined()
    expect(pinnedGraph(project, group('drums'))).toBe(project.groups![0]!.bus!.fx)
    expect(pinnedGraph(project, master)).toBe(project.master.fx)
  })

  it('has no graph when the kind has none, or its owner is gone', () => {
    const project = fixture()
    expect(pinnedGraph(project, track('ret'))).toBeUndefined()
    expect(pinnedGraph(project, track('audio', 'notes'))).toBeUndefined()
    expect(pinnedGraph(project, { owner: { kind: 'master' }, graph: 'patch' })).toBeUndefined()
    expect(pinnedGraph(removeTrack(project, 'lead'), track('lead'))).toBeUndefined()
    expect(pinnedGraph(setGroupBus(project, 'drums', false), group('drums'))).toBeUndefined()
    expect(pinnedGraph(ungroup(project, 'drums'), group('drums'))).toBeUndefined()
    expect(pinnedGraph(removeGroup(project, 'drums'), group('drums'))).toBeUndefined()
  })
})

describe('pin edits', () => {
  it('pins at the bottom, once, and only a graph that exists', () => {
    const project = pinPanel(pinPanel(fixture(), track('lead')), master)
    expect(keys(project)).toEqual(['lead:patch', 'master:fx'])
    expect(pinPanel(project, track('lead'))).toBe(project)
    expect(pinPanel(project, track('ret'))).toBe(project)
    expect(pinPanel(project, track('gone', 'fx'))).toBe(project)
  })

  it('pins no more than the limit', () => {
    let project = fixture()
    for (let index = 0; index < MAX_PINS; index++) project = { ...project, pins: [...(project.pins ?? []), track(`gone${index}`)] }
    expect(canPin(project, master)).toBe(false)
    expect(pinPanel(project, master)).toBe(project)
  })

  it('unpins, and drops the list with the last pin', () => {
    const project = pinPanel(pinPanel(fixture(), track('lead')), master)
    expect(keys(unpinPanel(project, 'lead:patch'))).toEqual(['master:fx'])
    expect(unpinPanel(unpinPanel(project, 'lead:patch'), 'master:fx')).not.toHaveProperty('pins')
    expect(unpinPanel(project, 'pad:patch')).toBe(project)
  })

  it('moves a pin among the shown ones, past a pin that isn\'t shown', () => {
    let project = fixture()
    for (const pin of [track('lead'), track('pad'), master]) project = pinPanel(project, pin)
    project = removeTrack(project, 'pad')
    expect(keys(project)).toEqual(['lead:patch', 'master:fx'])
    const moved = movePin(project, 'master:fx', -1)
    expect(keys(moved)).toEqual(['master:fx', 'lead:patch'])
    expect(moved.pins!.map(pinKey)).toEqual(['master:fx', 'pad:patch', 'lead:patch'])
    expect(movePin(project, 'lead:patch', -1)).toBe(project)
    expect(movePin(project, 'master:fx', 1)).toBe(project)
    expect(movePin(project, 'pad:patch', 1)).toBe(project)
  })

  it('collapses a pin, saving only a real true', () => {
    const project = pinPanel(fixture(), master)
    const collapsed = setPinCollapsed(project, 'master:fx', true)
    expect(collapsed.pins).toEqual([{ ...master, collapsed: true }])
    expect(setPinCollapsed(collapsed, 'master:fx', true)).toBe(collapsed)
    expect(setPinCollapsed(collapsed, 'master:fx', false).pins).toEqual([master])
    expect(setPinCollapsed(project, 'master:fx', false)).toBe(project)
    expect(setPinCollapsed(project, 'lead:patch', true)).toBe(project)
  })
})

describe('pins that come and go', () => {
  it('keeps a pin whose graph went, unshown, and shows it again when the graph is back', () => {
    const project = pinPanel(pinPanel(fixture(), group('drums')), track('lead', 'fx'))
    const unbused = setGroupBus(project, 'drums', false)
    expect(unbused.pins).toEqual(project.pins)
    expect(keys(unbused)).toEqual(['lead:fx'])
    expect(keys(removeTrack(project, 'lead'))).toEqual(['drums:fx'])
    expect(keys(setGroupBus(unbused, 'drums', true))).toEqual(['drums:fx', 'lead:fx'])
  })

  it('is the same list while nothing it reads changes', () => {
    const project = pinPanel(fixture(), master)
    expect(livePins(project)).toBe(livePins({ ...project, name: 'Other' }))
    expect(livePins(project)).not.toBe(livePins({ ...project, master: { ...project.master } }))
  })
})

describe('pins through undo and redo', () => {
  it('keeps the current pins on a project undo brings back', () => {
    const before = fixture()
    const now = pinPanel({ ...before, name: 'Edited' }, track('lead'))
    expect(keys(withViewOf(before, now))).toEqual(['lead:patch'])
    // An unpinned panel stays unpinned when an older project had it.
    expect(withViewOf(pinPanel(before, master), before)).not.toHaveProperty('pins')
    expect(withPinsOf(before, before)).toBe(before)
  })

  it('brings a removed track back with its pin where it was', () => {
    const pinned = pinPanel(pinPanel(fixture(), track('lead')), master)
    const removed = removeTrack(pinned, 'lead')
    expect(keys(removed)).toEqual(['master:fx'])
    expect(keys(withViewOf(pinned, removed))).toEqual(['lead:patch', 'master:fx'])
  })

  it('brings back a pin of an owner the current project doesn\'t have', () => {
    const before = fixture()
    const removed = removeTrack(before, 'lead')
    // Pinned after the removal was undone, then redone: the pin isn't the restored project's.
    const restored = pinPanel(before, track('lead'))
    expect(keys(withViewOf(restored, removed))).toEqual(['lead:patch'])
  })

  it('brings an old project\'s pins back when New project is undone, and keeps the new one\'s', () => {
    const old = pinPanel(pinPanel(fixture(), track('lead')), master)
    const fresh = pinPanel(addTrack(createEmptyProject(), { ...createReturnTrack('Return A'), id: 'other' }), track('other', 'fx'))
    const undone = withViewOf(old, fresh)
    expect(undone.pins!.map(pinKey)).toEqual(['other:fx', 'lead:patch', 'master:fx'])
    expect(keys(undone)).toEqual(['lead:patch', 'master:fx'])
  })
})
