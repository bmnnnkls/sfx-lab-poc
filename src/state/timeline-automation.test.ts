import { describe, expect, it } from 'vitest'
import { type AutomationLane, type ControlOwner, type InstrumentTrack, createArrangementClip, createClip, createEmptyProject, timelineLanesOf, timelineLanesOpen } from '@core'
import { automationGestureKey, editRegionAutomation, editTimelineAutomation } from './automation-store'
import { useProjectStore } from './project-store'

const master: ControlOwner = { kind: 'master' }
const lane = (beat: number): AutomationLane => ({
  id: 'lane',
  target: { kind: 'mixer', owner: master, control: 'volume' },
  enabled: true,
  points: [{ id: 'a', beat: 0, value: 0, interpolation: 'linear' }, { id: 'b', beat, value: 1, interpolation: 'linear' }],
})
const beatOfB = () => timelineLanesOf(useProjectStore.getState().project, master)[0]?.points[1]?.beat

describe('timeline lanes in the history', () => {
  it('a point drag is one undo step, and undo leaves the twisty as it is', () => {
    useProjectStore.getState().resetProject(createEmptyProject())
    editTimelineAutomation(master, [lane(4)])
    useProjectStore.getState().setTimelineLanesOpen(master, true)
    const key = automationGestureKey()
    for (const beat of [5, 6, 7, 8]) editTimelineAutomation(master, [lane(beat)], key)
    expect(beatOfB()).toBe(8)
    useProjectStore.getState().undo()
    expect(beatOfB()).toBe(4)
    expect(timelineLanesOpen(useProjectStore.getState().project, master)).toBe(true)
    useProjectStore.getState().undo()
    expect(beatOfB()).toBeUndefined()
    expect(timelineLanesOpen(useProjectStore.getState().project, master)).toBe(true)
  })
})

describe("a region's own lanes", () => {
  it('are edited through its ClipRef, leaving the session source alone', () => {
    const base = createEmptyProject()
    const track = base.tracks[0] as InstrumentTrack
    const source = { ...createClip('Source', 4), automation: [] }
    const project = { ...base, tracks: [{ ...track, clips: [source, ...track.clips.slice(1)] }], arrangement: [{ ...createArrangementClip(track.id, 0, source), id: 'r' }] }
    useProjectStore.getState().resetProject(project)
    const lane: AutomationLane = { id: 'l', target: { kind: 'mixer', owner: { kind: 'track', trackId: track.id }, control: 'pan' }, enabled: true, points: [{ id: 'p', beat: 1, value: 0.2, interpolation: 'linear' }] }
    editRegionAutomation('r', [lane, { ...lane, id: 'other', target: { ...lane.target, owner: { kind: 'master' } } }])
    const after = useProjectStore.getState().project
    expect(after.arrangement![0]!.content.automation).toEqual([lane])
    expect((after.tracks[0] as InstrumentTrack).clips[0]!.automation).toEqual([])
    useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.arrangement![0]!.content.automation).toEqual([])
  })
})
