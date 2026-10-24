import { create } from 'zustand'
import { type ViewId, useLayoutStore } from './layout-store'

export type EditorTab = 'device' | 'fx' | 'notes' | 'clip' | 'samples' | 'mixer' | 'presets' | 'library'

interface SelectionState {
  readonly trackId: string | null
  /** The master bus is selected (instead of a track): the Effects tab edits its graph. */
  readonly master: boolean
  readonly clipId: string | null
  readonly automationScene: number
  selectAutomation(owner: import('@core').ControlOwner, scene: number): void
  readonly tab: EditorTab
  selectTrack(trackId: string): void
  selectMaster(): void
  selectClip(trackId: string, clipId: string): void
  setTab(tab: EditorTab): void
  /** Forget selections that may point at tracks/clips from a previous project. */
  reset(): void
}

/** Transitional: the old tab ids still drive the panel until every caller uses a navigation intent. */
const VIEW_OF_TAB: Record<EditorTab, ViewId> = { device: 'instrument', fx: 'effects', notes: 'notes', clip: 'clip', samples: 'samples', mixer: 'mixer', presets: 'sounds', library: 'library' }
const show = (tab: EditorTab) => useLayoutStore.getState().revealView(VIEW_OF_TAB[tab])

/** What the user is currently looking at / editing. Pure UI state, never sent to the engine. */
export const useSelectionStore = create<SelectionState>((set) => ({
  automationScene: 0,
  selectAutomation: (owner, scene) => { show('clip'); set({ master: owner.kind === 'master', trackId: owner.kind === 'track' ? owner.trackId : null, automationScene: scene, clipId: null, tab: 'clip' }) },
  trackId: null,
  master: false,
  clipId: null,
  tab: 'device',
  selectTrack: (trackId) => set({ trackId, master: false }),
  selectMaster: () => { show('fx'); set({ master: true, trackId: null, tab: 'fx' }) },
  selectClip: (trackId, clipId) => { show('clip'); set({ trackId, master: false, clipId, tab: 'clip' }) },
  setTab: (tab) => { show(tab); set({ tab }) },
  reset: () => { useLayoutStore.getState().resetPanel(); set({ trackId: null, master: false, clipId: null, automationScene: 0, tab: 'device' }) },
}))
