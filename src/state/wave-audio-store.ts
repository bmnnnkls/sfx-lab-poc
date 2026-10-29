import type { PeakPyramid, SampleAudio } from '@core'
import { create } from 'zustand'

/** The decoded audio of the sample open in the Wave editor, and its peak pyramid. */
export interface WaveAudio {
  readonly sampleId: string
  /** What the editor's view is kept under (`useWaveEditorStore`): the sample's origin, so it follows edits and undo. */
  readonly viewKey: string
  readonly audio: SampleAudio
  readonly pyramid: PeakPyramid
}

interface WaveAudioState {
  /** The working copy: the open sample's audio on the main thread (the engine has its own). */
  readonly current: WaveAudio | null
  /** The sample whose working copy is being decoded, if any. */
  readonly loading: string | null
  /** The sample an edit is running on: one edit runs at a time, and the editor's edits are disabled meanwhile. */
  readonly editing: string | null
  setLoading(sampleId: string | null): void
  setCurrent(current: WaveAudio | null): void
  setEditing(sampleId: string | null): void
}

/** Filled in by the sample library service when the editor opens a sample; dropped when it closes. */
export const useWaveAudioStore = create<WaveAudioState>((set) => ({
  current: null,
  loading: null,
  editing: null,
  setLoading: (loading) => set({ loading }),
  setCurrent: (current) => set({ current, loading: null }),
  setEditing: (editing) => set({ editing }),
}))
