import { create } from 'zustand'

interface SelectionState {
  readonly trackId: string | null
  /** The master bus is selected (instead of a track): the Effects view edits its graph. */
  readonly master: boolean
  readonly clipId: string | null
  readonly automationScene: number
  /** The sample open in the sample editor, if any. */
  readonly sampleId: string | null
  selectAutomation(owner: import('@core').ControlOwner, scene: number): void
  selectTrack(trackId: string): void
  selectMaster(): void
  selectClip(trackId: string, clipId: string): void
  selectSample(sampleId: string | null): void
  /** Forget selections that may point at tracks/clips from a previous project. */
  reset(): void
}

/**
 * What the user is currently editing. Pure UI state, never sent to the engine. Selecting never changes which view
 * is showing; the intents in navigation.ts do both.
 */
export const useSelectionStore = create<SelectionState>((set) => ({
  automationScene: 0,
  selectAutomation: (owner, scene) => set({ master: owner.kind === 'master', trackId: owner.kind === 'track' ? owner.trackId : null, automationScene: scene, clipId: null }),
  trackId: null,
  master: false,
  clipId: null,
  sampleId: null,
  selectTrack: (trackId) => set({ trackId, master: false }),
  selectMaster: () => set({ master: true, trackId: null }),
  selectClip: (trackId, clipId) => set({ trackId, master: false, clipId }),
  selectSample: (sampleId) => set({ sampleId }),
  reset: () => set({ trackId: null, master: false, clipId: null, automationScene: 0, sampleId: null }),
}))
