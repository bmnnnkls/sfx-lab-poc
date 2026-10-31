import { create } from 'zustand'
import { useProjectStore } from './project-store'
import { useSelectionStore } from './selection-store'

/** The Wave editor's panes: the first, under the toolbar, and the second, under it when *View ▾ → Second pane* is on. */
export type WavePane = 'main' | 'second'

export const WAVE_PANES: readonly WavePane[] = ['main', 'second']

/** Which view of which sample: the subjects of the editor's lanes and marks, and the working copies, are each one. */
export interface WaveAt {
  readonly sampleId: string
  readonly pane: WavePane
}

/** The key a pane's view of a sample is kept under (`useWaveEditorStore`): the pane and the sample's origin. Nothing else builds one. */
export const waveViewKey = (pane: WavePane, origin: string): string => `${pane}:${origin}`

/** The second pane, remembered per browser (`sfxlab:wave-second-pane`). */
export interface SecondPane {
  readonly open: boolean
  /** The sample it shows; null for the first pane's. */
  readonly sampleId: string | null
  /** The first pane's part of the height the two share, between 0 and 1. */
  readonly share: number
}

export const DEFAULT_SECOND_PANE: SecondPane = { open: false, sampleId: null, share: 0.5 }

interface WavePanesState {
  readonly second: SecondPane
  /** The pane pressed or focused last: what ▶, the toolbar and its menus act on. Not remembered. */
  readonly active: WavePane
  setSecond(change: Partial<SecondPane>): void
  setActive(pane: WavePane): void
}

export const useWavePanesStore = create<WavePanesState>((set) => ({
  second: DEFAULT_SECOND_PANE,
  active: 'main',
  // Closing the second pane makes the first active.
  setSecond: (change) => set((state) => ({ second: { ...state.second, ...change }, ...(change.open === false && { active: 'main' as const }) })),
  setActive: (active) => set({ active }),
}))

/**
 * The sample a pane shows: the first, the editor's (`useSelectionStore.sampleId`); the second, its own if the project
 * has it, else the first's. Null when the pane shows nothing (the second only while it is open).
 */
export const paneSampleId = (pane: WavePane): string | null => {
  const first = useSelectionStore.getState().sampleId
  if (pane === 'main') return first
  const { open, sampleId } = useWavePanesStore.getState().second
  if (!open || first === null) return null
  return sampleId !== null && useProjectStore.getState().project.samples.some((sample) => sample.id === sampleId) ? sampleId : first
}
