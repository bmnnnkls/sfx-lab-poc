import { createContext, useContext } from 'react'

/** Everything the UI may ask of the audio engine. Implemented in `app/`, consumed by `ui/`. */
export interface EngineControls {
  play(): void
  stop(): void
  launchClip(trackId: string, clipId: string): void
  launchScene(scene: number): void
  stopTrack(trackId: string): void
  /** Plays one short note through a track's instrument, to hear what is being edited. */
  auditionNote(trackId: string, pitch: number, velocity: number): void
}

const EngineControlsContext = createContext<EngineControls | null>(null)

export const EngineControlsProvider = EngineControlsContext.Provider

export const useEngineControls = (): EngineControls => {
  const controls = useContext(EngineControlsContext)
  if (!controls) throw new Error('useEngineControls must be used inside EngineControlsProvider')
  return controls
}
