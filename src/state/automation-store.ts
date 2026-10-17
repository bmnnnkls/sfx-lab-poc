import { create } from 'zustand'
import { type AutomationLane, type ControlTarget, commit, controlTargetKey, setClipAutomation } from '@core'
import { useProjectStore } from './project-store'
import { useSelectionStore } from './selection-store'
interface AutomationEditorState {
  readonly visible: boolean
  readonly target?: ControlTarget
  show(target?: ControlTarget): void
  hide(): void
}
export const useAutomationEditor = create<AutomationEditorState>((set) => ({
  visible: false,
  show: (target) => { set({ visible: true, target }); useSelectionStore.getState().setTab('clip') },
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
