import { create } from 'zustand'

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

/** What the user is currently looking at / editing. Pure UI state, never sent to the engine. */
export const useSelectionStore = create<SelectionState>((set) => ({
  automationScene: 0,
  selectAutomation: (owner, scene) => set({ master: owner.kind === 'master', trackId: owner.kind === 'track' ? owner.trackId : null, automationScene: scene, clipId: null, tab: 'clip' }),
  trackId: null,
  master: false,
  clipId: null,
  tab: 'device',
  selectTrack: (trackId) => set({ trackId, master: false }),
  selectMaster: () => set({ master: true, trackId: null, tab: 'fx' }),
  selectClip: (trackId, clipId) => set({ trackId, master: false, clipId, tab: 'clip' }),
  setTab: (tab) => set({ tab }),
  reset: () => set({ trackId: null, master: false, clipId: null, automationScene: 0, tab: 'device' }),
}))
