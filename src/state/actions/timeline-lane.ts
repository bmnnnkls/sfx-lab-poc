import { type AutomationLane, type ControlOwner, type ControlTarget, controlTargetKey, timelineLanesOf, timelineLanesOpen, timelineOwnerAllowed } from '@core'
import { editTimelineAutomation } from '../automation-store'
import { useControlStore } from '../control-store'
import { useLayoutStore } from '../layout-store'
import { useSelectionStore } from '../selection-store'
import { finishTargetTouch } from '../touch-store'
import { project } from './lookup'
import { useProjectStore } from '../project-store'
import type { Action, Subject, SubjectOf } from './types'

type LaneSubject = SubjectOf<'timeline-lane'>

/** The lane a subject names, if it is still there. */
export const timelineLaneOf = ({ owner, laneId }: Pick<LaneSubject, 'owner' | 'laneId'>): AutomationLane | undefined =>
  timelineLanesOf(project(), owner).find((lane) => lane.id === laneId)

/** The owner's lanes with one changed, as one undo step. */
const editLane = (subject: LaneSubject, change: (lane: AutomationLane) => AutomationLane | null) => {
  const lanes = timelineLanesOf(project(), subject.owner)
  const next = lanes.flatMap((lane) => {
    if (lane.id !== subject.laneId) return [lane]
    const changed = change(lane)
    return changed ? [changed] : []
  })
  editTimelineAutomation(subject.owner, next)
}

/** Whether a control is overridden by hand while its lane plays. */
export const overridden = (target: ControlTarget): boolean => useControlStore.getState().overrides.some((entry) => controlTargetKey(entry.target) === controlTargetKey(target))

/** Gives a control back to its lane (*Read*): the override and any touch on it end. */
export const readLane = (target: ControlTarget): void => {
  finishTargetTouch(target)
  useControlStore.getState().release(target)
}

/** Shows the control a target names: its owner selected and the view its control is in. */
export const showControl = (target: ControlTarget): void => {
  const selection = useSelectionStore.getState()
  const owner = target.owner
  if (owner.kind === 'master') selection.selectMaster()
  else if (owner.kind === 'group') selection.selectGroup(owner.groupId)
  else selection.selectTrack(owner.trackId)
  useLayoutStore.getState().revealView(target.kind === 'mixer' ? 'mixer' : target.domain === 'patch' ? 'instrument' : target.domain === 'notes' ? 'notes' : 'effects')
}

const segmentTitle = (interpolation: 'linear' | 'hold') => (interpolation === 'linear' ? 'Linear segment' : 'Hold segment')

/** Sets the interpolation of the segment holding `beat`: the last point at or before it. */
const setSegment = (subject: LaneSubject, interpolation: 'linear' | 'hold') =>
  editLane(subject, (lane) => {
    const start = [...lane.points].reverse().find((point) => point.beat <= (subject.beat ?? -1) + 1e-9)
    return start ? { ...lane, points: lane.points.map((point) => (point === start ? { ...point, interpolation } : point)) } : lane
  })

const showInPanel: Action<LaneSubject> = {
  id: 'timeline-lane.show-in-panel',
  title: 'Show in panel',
  group: 'open',
  run: (subject) => {
    const lane = timelineLaneOf(subject)
    if (lane) showControl(lane.target)
  },
}

/** A lane on the arrangement's timeline, from its header's or its body's right-click menu and the palette. */
export const timelineLaneActions: readonly Action<LaneSubject>[] = [showInPanel, ...(['linear', 'hold'] as const).map((interpolation): Action<LaneSubject> => ({
  id: `timeline-lane.${interpolation}`,
  title: segmentTitle(interpolation),
  group: 'edit',
  tooltip: () => (interpolation === 'linear' ? 'Ramp from this point to the next' : 'Hold this point’s value until the next'),
  // Only from a right-click on the lane's body, on a segment.
  applies: (subject) => subject.beat !== undefined,
  enabled: (subject) => {
    const lane = timelineLaneOf(subject)
    const start = lane && [...lane.points].reverse().find((point) => point.beat <= subject.beat! + 1e-9)
    return !!start && start.interpolation !== interpolation
  },
  run: (subject) => setSegment(subject, interpolation),
})),
  {
    id: 'timeline-lane.enable',
    title: (subject) => (timelineLaneOf(subject)?.enabled === false ? 'Enable lane' : 'Disable lane'),
    group: 'edit',
    run: (subject) => editLane(subject, (lane) => ({ ...lane, enabled: !lane.enabled })),
  },
  {
    id: 'timeline-lane.read',
    title: 'Read',
    group: 'edit',
    tooltip: () => 'Give the control back to its lane',
    enabled: (subject) => {
      const lane = timelineLaneOf(subject)
      return !!lane && overridden(lane.target)
    },
    run: (subject) => {
      const lane = timelineLaneOf(subject)
      if (lane) readLane(lane.target)
    },
  },
  {
    id: 'timeline-lane.clear',
    title: 'Clear',
    group: 'delete',
    enabled: (subject) => (timelineLaneOf(subject)?.points.length ?? 0) > 0,
    run: (subject) => editLane(subject, (lane) => ({ ...lane, points: [] })),
  },
  {
    id: 'timeline-lane.delete',
    verb: 'delete',
    title: 'Delete lane',
    group: 'delete',
    run: (subject) => editLane(subject, () => null),
  },
]

/** *Show automation lanes* / *Hide automation lanes* on an owner's menu: its lanes twisty on the timeline. */
export const lanesToggleAction = <S extends Subject>(id: string, ownerOf: (subject: S) => ControlOwner): Action<S> => ({
  id,
  title: (subject) => `${timelineLanesOpen(project(), ownerOf(subject)) ? 'Hide' : 'Show'} automation lanes`,
  tooltip: () => 'Its automation lanes under its row on the arrangement',
  group: 'view',
  applies: (subject) => timelineOwnerAllowed(project(), ownerOf(subject)),
  run: (subject) => {
    const owner = ownerOf(subject)
    useProjectStore.getState().setTimelineLanesOpen(owner, !timelineLanesOpen(project(), owner))
  },
})
