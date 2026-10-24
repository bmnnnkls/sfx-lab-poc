import { create } from 'zustand'

interface SelectionState {
  readonly trackId: string | null
  /** The master bus is selected (instead of a track): the Effects view edits its graph. */
  readonly master: boolean
  readonly clipId: string | null
  /** The arrangement region selected, if any: Clip edits its own copy. Its track is `trackId`. */
  readonly regionId: string | null
  readonly automationScene: number
  /** The sample open in the sample editor, if any. */
  readonly sampleId: string | null
  selectAutomation(owner: import('@core').ControlOwner, scene: number): void
  selectTrack(trackId: string): void
  selectMaster(): void
  selectClip(trackId: string, clipId: string): void
  /** Selects a region and its track, instead of a session clip. */
  selectRegion(regionId: string, trackId: string): void
  selectSample(sampleId: string | null): void
  /** Forget selections that may point at tracks/clips from a previous project. */
  reset(): void
}

/**
 * What the user is currently editing. Pure UI state, never sent to the engine. Selecting never changes which view
 * is showing; the intents in navigation.ts do both. Selecting anything but a region or a sample deselects the region.
 */
export const useSelectionStore = create<SelectionState>((set) => ({
  automationScene: 0,
  selectAutomation: (owner, scene) => set({ master: owner.kind === 'master', trackId: owner.kind === 'track' ? owner.trackId : null, automationScene: scene, clipId: null, regionId: null }),
  trackId: null,
  master: false,
  clipId: null,
  regionId: null,
  sampleId: null,
  selectTrack: (trackId) => set({ trackId, master: false, regionId: null }),
  selectMaster: () => set({ master: true, trackId: null, regionId: null }),
  selectClip: (trackId, clipId) => set({ trackId, master: false, clipId, regionId: null }),
  selectRegion: (regionId, trackId) => set({ regionId, trackId, master: false, clipId: null }),
  selectSample: (sampleId) => set({ sampleId }),
  reset: () => set({ trackId: null, master: false, clipId: null, regionId: null, automationScene: 0, sampleId: null }),
}))
