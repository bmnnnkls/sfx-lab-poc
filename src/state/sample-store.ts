import { create } from 'zustand'

/** `missing`: the project lists the sample but its audio is not stored here (re-import the file). */
export type SampleStatus = 'loading' | 'ready' | 'missing' | 'error'

interface SampleState {
  readonly status: Readonly<Record<string, SampleStatus>>
  /** Waveform thumbnails, one peak value per bucket. */
  readonly peaks: Readonly<Record<string, Float32Array>>
  setStatus(id: string, status: SampleStatus): void
  setPeaks(id: string, peaks: Float32Array): void
  forget(id: string): void
}

/** Load state and waveform thumbnails of the project's samples; filled in by the sample library service. */
export const useSampleStore = create<SampleState>((set) => ({
  status: {},
  peaks: {},
  setStatus: (id, status) => set((state) => ({ status: { ...state.status, [id]: status } })),
  setPeaks: (id, peaks) => set((state) => ({ peaks: { ...state.peaks, [id]: peaks } })),
  forget: (id) =>
    set((state) => {
      const { [id]: _status, ...status } = state.status
      const { [id]: _peaks, ...peaks } = state.peaks
      return { status, peaks }
    }),
}))
