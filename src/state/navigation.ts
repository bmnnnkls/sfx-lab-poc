import type { ControlOwner } from '@core'
import { type ViewId, useLayoutStore } from './layout-store'
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
