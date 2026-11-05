import { create } from 'zustand'
import { type AutomationLane, type ControlTarget, commit, controlTargetKey, setClipAutomation, automationSlotsOf, setAutomationSlot, setTimelineLanes, type ControlOwner, type AutomationSlot } from '@core'
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
