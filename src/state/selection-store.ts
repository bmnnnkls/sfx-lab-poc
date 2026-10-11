import { create } from 'zustand'

export type EditorTab = 'device' | 'clip'

interface SelectionState {
  readonly trackId: string | null
  readonly clipId: string | null
  readonly tab: EditorTab
  selectTrack(trackId: string): void
  selectClip(trackId: string, clipId: string): void
  setTab(tab: EditorTab): void
  /** Forget selections that may point at tracks/clips from a previous project. */
  reset(): void
}

/** What the user is currently looking at / editing. Pure UI state, never sent to the engine. */
export const useSelectionStore = create<SelectionState>((set) => ({
  trackId: null,
  clipId: null,
  tab: 'device',
  selectTrack: (trackId) => set({ trackId }),
  selectClip: (trackId, clipId) => set({ trackId, clipId, tab: 'clip' }),
  setTab: (tab) => set({ tab }),
  reset: () => set({ trackId: null, clipId: null, tab: 'device' }),
}))
