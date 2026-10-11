import type { EngineStatus } from '@core'
import { create } from 'zustand'

interface StatusState {
  readonly status: EngineStatus | null
  setStatus(status: EngineStatus): void
}

/** Latest snapshot reported by the audio engine (playhead, launch states). Updates ~30x/s. */
export const useStatusStore = create<StatusState>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
}))
