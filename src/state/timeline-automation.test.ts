import { describe, expect, it } from 'vitest'
import { type AutomationLane, type ControlOwner, createEmptyProject, timelineLanesOf, timelineLanesOpen } from '@core'
import { automationGestureKey, editTimelineAutomation } from './automation-store'
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
