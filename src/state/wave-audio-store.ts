import type { PeakPyramid, SampleAudio } from '@core'
import { create } from 'zustand'
import type { WavePane } from './wave-panes'

/** The decoded audio of the sample a pane of the Wave editor shows, and its peak pyramid. */
export interface WaveAudio {
  readonly sampleId: string
  /** The pane that shows it. */
  readonly pane: WavePane
  /** What the pane's view is kept under (`useWaveEditorStore`): the pane and the sample's origin (`waveViewKey`), so it follows edits and undo. */
  readonly viewKey: string
  readonly audio: SampleAudio
  readonly pyramid: PeakPyramid
}

interface WaveAudioState {
  /**
   * The working copies: each pane's sample's audio on the main thread (the engine has its own). Two panes on one sample
   * share one `audio` and `pyramid`.
   */
  readonly panes: Readonly<Record<WavePane, WaveAudio | null>>
  /** The sample whose working copy each pane is waiting for, if any. */
  readonly loading: Readonly<Record<WavePane, string | null>>
  /** The sample an edit is running on: one edit runs at a time, in either pane, and the editor's edits are disabled meanwhile. */
  readonly editing: string | null
  setLoading(pane: WavePane, sampleId: string | null): void
  /** A pane's working copy, or none; its loading is over either way. */
  setPane(pane: WavePane, wave: WaveAudio | null): void
  setEditing(sampleId: string | null): void
}

export const NO_WAVE_PANES: Readonly<Record<WavePane, null>> = { main: null, second: null }

/** Filled in by the sample library service when a pane opens a sample; dropped when it closes. */
export const useWaveAudioStore = create<WaveAudioState>((set) => ({
  panes: NO_WAVE_PANES,
  loading: NO_WAVE_PANES,
  editing: null,
  setLoading: (pane, sampleId) => set((state) => ({ loading: { ...state.loading, [pane]: sampleId } })),
  setPane: (pane, wave) => set((state) => ({ panes: { ...state.panes, [pane]: wave }, loading: { ...state.loading, [pane]: null } })),
  setEditing: (editing) => set({ editing }),
}))
