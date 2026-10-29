import { type ControlOwner, type PanelPin, isPinned, pinKey } from '@core'
import { useGraphViewStore } from './graph-view-store'
import { type ViewId, useLayoutStore } from './layout-store'
import { useProjectStore } from './project-store'
import { useSelectionStore } from './selection-store'

/*
 * Selecting something and showing it are separate steps. These intents are for code that wants both:
 * they select, then reveal the view that edits the selection, wherever that view is docked.
 */

const reveal = (id: ViewId) => useLayoutStore.getState().revealView(id)

/** Edit a clip: its piano roll, audio editor or automation. */
export const openClip = (trackId: string, clipId: string) => {
  useSelectionStore.getState().selectClip(trackId, clipId)
  reveal('clip')
}

/** Edit a region's own copy of its clip, on the arrangement. */
export const openRegion = (regionId: string) => {
  const region = useProjectStore.getState().project.arrangement?.find((candidate) => candidate.id === regionId)
  if (!region) return
  useSelectionStore.getState().selectRegion(regionId, region.trackId)
  reveal('clip')
}

/** Select a track and show one of its views, for the fx / notes / instrument shortcuts. */
export const openTrackView = (trackId: string, view: ViewId) => {
  useSelectionStore.getState().selectTrack(trackId)
  reveal(view)
}

/** Edit the effects on the final mix. */
export const openMasterEffects = () => {
  useSelectionStore.getState().selectMaster()
  reveal('effects')
}

/** Edit the effects on a group's bus (or offer to make one, for a folder). */
export const openGroupEffects = (groupId: string) => {
  useSelectionStore.getState().selectGroup(groupId)
  reveal('effects')
}

/** Pins a graph's front panel when it isn't pinned, and asks the Pinned view to show it. */
export const revealPin = (pin: Pick<PanelPin, 'owner' | 'graph'>) => {
  const store = useProjectStore.getState()
  store.pinPanel(pin)
  if (!isPinned(useProjectStore.getState().project, pin)) return
  useGraphViewStore.getState().requestPin(pinKey(pin))
}

const EDITORS = { patch: 'instrument', fx: 'effects', notes: 'notes' } as const

/** Selects a pin's owner and shows the editor of its graph, in the mode (Graph or Panel) that editor was in. */
export const openPinnedEditor = ({ owner, graph }: Pick<PanelPin, 'owner' | 'graph'>) => {
  if (owner.kind === 'track') openTrackView(owner.trackId, EDITORS[graph])
  else if (owner.kind === 'group') openGroupEffects(owner.groupId)
  else openMasterEffects()
}

/** Edit an automation slot of the master or a return track. */
export const openAutomationSlot = (owner: ControlOwner, scene: number) => {
  useSelectionStore.getState().selectAutomation(owner, scene)
  reveal('clip')
}

/** Open a sample in the wave editor. */
export const openSampleEditor = (sampleId: string) => {
  useSelectionStore.getState().selectSample(sampleId)
  reveal('wave')
}
