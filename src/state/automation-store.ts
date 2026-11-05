import { create } from 'zustand'
import { type AutomationLane, type ControlTarget, MAX_AUTOMATION_LANES, automationTargetOwnedBy, canonicalAutomationPoints, commit, controlTargetKey, editClipAt, regionClipRef, setClipAutomation, automationSlotsOf, setAutomationSlot, setTimelineLanes, timelineLanesOf, timelineOwnerAllowed, uniqueAutomationLanes, type ControlOwner, type AutomationSlot } from '@core'
import { useProjectStore } from './project-store'
import { useLayoutStore } from './layout-store'
import { openAutomationSlot } from './navigation'
import { useSelectionStore } from './selection-store'
interface AutomationEditorState {
  readonly visible: boolean
  readonly target?: ControlTarget
  show(target?: ControlTarget): void
  hide(): void
}
export const useAutomationEditor = create<AutomationEditorState>((set) => ({
  visible: false,
  show: (target) => {
    if (target) {
      const project = useProjectStore.getState().project
      const owner = target.owner
      if (owner.kind === 'master' || (owner.kind === 'track' && project.tracks.find((t) => t.id === owner.trackId)?.kind === 'return')) {
        const scene = useSelectionStore.getState().automationScene
        if (!automationSlotsOf(project, owner)?.[scene]) editAutomationSlot(owner, scene, { id: crypto.randomUUID(), name: 'Automation', lengthBeats: 4 })
        openAutomationSlot(owner, scene)
      }
    }
    set({ visible: true, target }); useLayoutStore.getState().revealView('clip')
  },
  hide: () => set({ visible: false, target: undefined }),
}))
let serial = 0
export const automationGestureKey = () => `automation:${++serial}`
export const editClipAutomation = (trackId: string, clipId: string, lanes: readonly AutomationLane[], key?: string) => {
  const store = useProjectStore.getState()
  const track = store.project.tracks.find((track) => track.id === trackId)
  const clip = track?.kind !== 'return' ? track?.clips.find((clip) => clip?.id === clipId) : undefined
  if (!clip || JSON.stringify(clip.automation ?? []) === JSON.stringify(lanes)) return
  const project = setClipAutomation(store.project, trackId, clipId, lanes)
  if (project === store.project) return
  const history = commit(store.history, project, { key, now: Date.now(), mergeWindowMs: Infinity })
  useProjectStore.setState({ project, history })
}
export const findAutomationLane = (lanes: readonly AutomationLane[], target: ControlTarget) => lanes.find((lane) => controlTargetKey(lane.target) === controlTargetKey(target))

export const editAutomationSlot = (owner: ControlOwner, scene: number, slot: AutomationSlot | null, key?: string) => {
  const store = useProjectStore.getState()
  const project = setAutomationSlot(store.project, owner, scene, slot)
  if (project === store.project) return
  useProjectStore.setState({ project, history: commit(store.history, project, { key, now: Date.now(), mergeWindowMs: Infinity }) })
}
export const editOwnerAutomation = (owner: ControlOwner, clipId: string, lanes: readonly AutomationLane[], key?: string) => {
  const slots = automationSlotsOf(useProjectStore.getState().project, owner)
  const scene = slots?.findIndex((slot) => slot?.id === clipId) ?? -1
  const slot = slots?.[scene]
  if (slot) editAutomationSlot(owner, scene, { ...slot, automation: lanes }, key)
  else if (owner.kind === 'track') editClipAutomation(owner.trackId, clipId, lanes, key)
}

/** Sets an owner's lanes on the timeline: one undo step, a drag's edits merging under its `key`. */
export const editTimelineAutomation = (owner: ControlOwner, lanes: readonly AutomationLane[], key?: string) => {
  const store = useProjectStore.getState()
  const project = setTimelineLanes(store.project, owner, lanes)
  if (project === store.project) return
  useProjectStore.setState({ project, history: commit(store.history, project, { key, now: Date.now(), mergeWindowMs: Infinity }) })
}

/** Sets a region's own lanes (its copy, never its session source): one undo step, a drag merging under its `key`. */
export const editRegionAutomation = (regionId: string, lanes: readonly AutomationLane[], key?: string) => {
  const store = useProjectStore.getState()
  const region = store.project.arrangement?.find((candidate) => candidate.id === regionId)
  if (!region) return
  const project = editClipAt(store.project, regionClipRef(regionId), (clip) => {
    const automation = uniqueAutomationLanes(lanes)
      .filter((lane) => automationTargetOwnedBy(lane.target, region.trackId))
      .slice(0, MAX_AUTOMATION_LANES)
      .map((lane) => ({ ...lane, points: canonicalAutomationPoints(lane.points, clip.lengthBeats) }))
    return JSON.stringify(automation) === JSON.stringify(clip.automation ?? []) ? clip : { ...clip, automation }
  })
  if (project === store.project) return
  useProjectStore.setState({ project, history: commit(store.history, project, { key, now: Date.now(), mergeWindowMs: Infinity }) })
}

/** A timeline lane asked to scroll into view and take the focus (by its target's key), once it is drawn. */
export const useTimelineLaneRequest = create<{ readonly key: string | null; clear(): void }>((set) => ({
  key: null,
  clear: () => set({ key: null }),
}))

/**
 * *Show automation on timeline*: reveals the Arrangement, opens the owner's lanes, adds the control's lane when it has
 * none (one undo step), and asks that lane to scroll into view and take the focus. Nothing for an owner that can't
 * have timeline lanes (a folder).
 */
export const showTimelineAutomation = (target: ControlTarget) => {
  const store = useProjectStore.getState()
  if (!timelineOwnerAllowed(store.project, target.owner)) return
  const lanes = timelineLanesOf(store.project, target.owner)
  if (!findAutomationLane(lanes, target)) editTimelineAutomation(target.owner, [...lanes, { id: crypto.randomUUID(), target, enabled: true, points: [] }])
  useProjectStore.getState().setTimelineLanesOpen(target.owner, true)
  useLayoutStore.getState().revealView('arrangement')
  useTimelineLaneRequest.setState({ key: controlTargetKey(target) })
}
