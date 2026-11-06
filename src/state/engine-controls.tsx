import type { ExpressionControl, LiveNoteAddress } from '@core'
import { createContext, useContext } from 'react'

/** Everything the UI may ask of the audio engine. Implemented in `app/`, consumed by `ui/`. */
export interface EngineControls {
  noteOn(trackId: string, note: LiveNoteAddress, pitch: number, velocity: number): void
  noteOff(trackId: string, note: LiveNoteAddress): void
  sustain(sourceId: string, channel: number, down: boolean): void
  /** The keyboard's wheel, pressure or an unmapped CC on an instrument track; sent at once, not throttled. */
  expression(trackId: string, sourceId: string, channel: number, control: ExpressionControl, value: number): void
  releaseSource(sourceId: string, channel?: number): void
  panic(): void
  play(): void
  stop(): void
  launchClip(trackId: string, clipId: string): void
  launchAutomation(owner: import('@core').ControlOwner, slotId: string | null): void
  /** Every track's clip in that scene; with `trackIds`, only those tracks' (a collapsed group's cell). */
  launchScene(scene: number, trackIds?: readonly string[]): void
  stopTrack(trackId: string): void
  /** Plays one short note through a track's instrument, to hear what is being edited. */
  auditionNote(trackId: string, pitch: number, velocity: number): void
  /** Plays the arrangement timeline from `fromBeat` (beats); the session launchers step aside. */
  playArrangement(fromBeat?: number): void
}

const EngineControlsContext = createContext<EngineControls | null>(null)

export const EngineControlsProvider = EngineControlsContext.Provider

export const useEngineControls = (): EngineControls => {
  const controls = useContext(EngineControlsContext)
  if (!controls) throw new Error('useEngineControls must be used inside EngineControlsProvider')
  return controls
}
