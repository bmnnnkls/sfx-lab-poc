import { describe, expect, it } from 'vitest'
import type { ControlOwner, ControlTarget } from '../control'
import {
  addTrack,
  createArrangementClip,
  createClip,
  createDemoProject,
  createReturnTrack,
  createTrack,
  duplicateTrack,
  MAX_TIMELINE_BEATS,
  removeGroup,
  removeTrack,
  setGroupBus,
  ungroup,
  updateArrangementClip,
  withViewOf,
  type Project,
} from '../project'
import {
  setTimelineLanes,
  setTimelineLanesOpen,
  timelineLanesOf,
  timelineLanesOpen,
  timelineOwnerAllowed,
} from './timeline'
import { MAX_AUTOMATION_LANES, type AutomationLane } from './types'

/** Tracks A and B, a return R; group G (a bus) around A, folder F around B. */
const fixture = (): Project => {
  let project: Project = { ...createDemoProject(), tracks: [], groups: undefined }
  for (const name of ['A', 'B']) project = addTrack(project, { ...createTrack(name, 4), id: name })
  project = addTrack(project, { ...createReturnTrack('R'), id: 'R' })
  project = {
    ...project,
    groups: [{ id: 'G', name: 'G', colour: 'red' }, { id: 'F', name: 'F', colour: 'blue' }],
    tracks: project.tracks.map((track) => (track.id === 'A' ? { ...track, groupId: 'G' } : track.id === 'B' ? { ...track, groupId: 'F' } : track)),
  }
  return setGroupBus(project, 'G', true)
}

const track = (trackId: string): ControlOwner => ({ kind: 'track', trackId })
const group = (groupId: string): ControlOwner => ({ kind: 'group', groupId })
const volume = (owner: ControlOwner): ControlTarget => ({ kind: 'mixer', owner, control: 'volume' })
const send = (owner: ControlOwner, returnId: string): ControlTarget => ({ kind: 'mixer', owner, control: 'send', returnId })
const lane = (target: ControlTarget, beats: readonly number[] = [0, 4], id = `lane-${JSON.stringify(target)}`): AutomationLane => ({
  id,
  target,
  enabled: true,
  points: beats.map((beat, i) => ({ id: `${id}-${i}`, beat, value: i / Math.max(1, beats.length - 1), interpolation: 'linear' })),
})

describe('who may own timeline lanes', () => {
  it.each([
    ['a track', track('A'), true],
    ['a return', track('R'), true],
    ['the master', { kind: 'master' } as ControlOwner, true],
    ['a group with a bus', group('G'), true],
    ['a folder', group('F'), false],
    ['a missing track', track('nope'), false],
    ['a missing group', group('nope'), false],
  ])('%s: %s', (_, owner, allowed) => {
    expect(timelineOwnerAllowed(fixture(), owner)).toBe(allowed)
  })
})

describe('setTimelineLanes', () => {
  it('sets an owner its lanes, in song beats, and gives the same project when nothing changes', () => {
    const project = fixture()
    const next = setTimelineLanes(project, group('G'), [lane(volume(group('G')), [0, 100, 4000])])
    expect(timelineLanesOf(next, group('G'))[0]!.points.map((point) => point.beat)).toEqual([0, 100, 4000])
    expect(setTimelineLanes(next, group('G'), timelineLanesOf(next, group('G')))).toBe(next)
  })

  it('refuses a folder and a missing owner', () => {
    const project = fixture()
    expect(setTimelineLanes(project, group('F'), [lane(volume(group('F')))])).toBe(project)
    expect(setTimelineLanes(project, track('nope'), [lane(volume(track('nope')))])).toBe(project)
  })

  it("keeps only the owner's own targets, one lane per target, at most 64", () => {
    const project = fixture()
    const next = setTimelineLanes(project, track('A'), [lane(volume(track('A')), [0], 'a'), lane(volume(track('A')), [1], 'b'), lane(volume(track('B')), [0], 'c')])
    expect(timelineLanesOf(next, track('A')).map((l) => l.id)).toEqual(['b'])
    const many = Array.from({ length: MAX_AUTOMATION_LANES + 1 }, (_, i) => lane({ kind: 'graph', owner: track('A'), domain: 'fx', path: [], nodeId: `n${i}`, nodeType: 'gain', paramId: 'gain' }, [0], `l${i}`))
    expect(timelineLanesOf(setTimelineLanes(project, track('A'), many), track('A'))).toHaveLength(MAX_AUTOMATION_LANES)
  })

  it('drops points past the timeline', () => {
    const next = setTimelineLanes(fixture(), track('A'), [lane(volume(track('A')), [0, MAX_TIMELINE_BEATS, MAX_TIMELINE_BEATS + 1])])
    expect(timelineLanesOf(next, track('A'))[0]!.points.map((point) => point.beat)).toEqual([0, MAX_TIMELINE_BEATS])
  })

  it('removes an entry left with no lanes, unless it is open', () => {
    const project = fixture()
    const set = setTimelineLanes(project, track('A'), [lane(volume(track('A')))])
    expect(setTimelineLanes(set, track('A'), []).arrangementAutomation).toBeUndefined()
    const open = setTimelineLanesOpen(set, track('A'), true)
    expect(setTimelineLanes(open, track('A'), []).arrangementAutomation).toEqual([{ owner: track('A'), lanes: [], open: true }])
  })
})

describe('the lanes twisty', () => {
  it('opens and closes, and is carried across undo as a view field', () => {
    const project = setTimelineLanes(fixture(), track('A'), [lane(volume(track('A')))])
    const open = setTimelineLanesOpen(project, track('A'), true)
    expect(timelineLanesOpen(open, track('A'))).toBe(true)
    expect(setTimelineLanesOpen(open, track('A'), true)).toBe(open)
    // Undo back to `project` while the lanes show keeps them showing.
    expect(timelineLanesOpen(withViewOf(project, open), track('A'))).toBe(true)
    expect(timelineLanesOpen(withViewOf(open, project), track('A'))).toBe(false)
    // An owner with no lanes can be opened (to add one) and closed again without an entry left behind.
    const empty = setTimelineLanesOpen(fixture(), track('R'), true)
    expect(setTimelineLanesOpen(empty, track('R'), false).arrangementAutomation).toBeUndefined()
    const folder = fixture()
    expect(setTimelineLanesOpen(folder, group('F'), true)).toBe(folder)
  })
})

describe('cleanup', () => {
  const withLanes = () => {
    let project = fixture()
    project = setTimelineLanes(project, track('A'), [lane(volume(track('A'))), lane(send(track('A'), 'R'))])
    project = setTimelineLanes(project, track('R'), [lane(volume(track('R')))])
    project = setTimelineLanes(project, group('G'), [lane(volume(group('G'))), lane(send(group('G'), 'R'))])
    return project
  }

  it("removing a track drops its entry; removing a return drops other owners' sends to it", () => {
    expect(timelineLanesOf(removeTrack(withLanes(), 'A'), track('A'))).toEqual([])
    const noReturn = removeTrack(withLanes(), 'R')
    expect(timelineLanesOf(noReturn, track('R'))).toEqual([])
    expect(timelineLanesOf(noReturn, track('A')).map((l) => l.target)).toEqual([volume(track('A'))])
    expect(timelineLanesOf(noReturn, group('G')).map((l) => l.target)).toEqual([volume(group('G'))])
  })

  it('ungroup, removeGroup and a group losing its last track drop the group entry', () => {
    expect(timelineLanesOf(ungroup(withLanes(), 'G'), group('G'))).toEqual([])
    expect(timelineLanesOf(removeGroup(withLanes(), 'G'), group('G'))).toEqual([])
    expect(timelineLanesOf(removeTrack(withLanes(), 'A'), group('G'))).toEqual([])
  })

  it('switching the bus off keeps the lanes, and back on they are there', () => {
    const off = setGroupBus(withLanes(), 'G', false)
    expect(timelineLanesOf(off, group('G'))).toHaveLength(2)
    expect(timelineLanesOf(setGroupBus(off, 'G', true), group('G'))).toHaveLength(2)
  })

  it('duplicating a track copies its timeline lanes onto the copy, with fresh ids', () => {
    const project = withLanes()
    const { project: next, trackId } = duplicateTrack(project, 'A')
    const copied = timelineLanesOf(next, track(trackId!))
    expect(copied.map((l) => l.target)).toEqual([volume(track(trackId!)), send(track(trackId!), 'R')])
    expect(copied.map((l) => l.id)).not.toEqual(timelineLanesOf(project, track('A')).map((l) => l.id))
    expect(timelineLanesOf(next, track('A'))).toEqual(timelineLanesOf(project, track('A')))
  })
})

describe('a region moved to another track', () => {
  it("takes its own lanes' owner along", () => {
    const content = { ...createClip('Pad', 4), automation: [lane(volume(track('A')))] }
    const region = createArrangementClip('A', 0, content)
    const [moved] = updateArrangementClip([region], region.id, { trackId: 'B' })
    expect(moved!.content.automation![0]!.target).toEqual(volume(track('B')))
    const [kept] = updateArrangementClip([region], region.id, { startBeat: 4 })
    expect(kept!.content.automation![0]!.target).toEqual(volume(track('A')))
  })
})
