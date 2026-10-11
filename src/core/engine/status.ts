import type { LauncherStatus } from '../session'

/** Snapshot of engine state for display; produced by the engine, consumed by the UI. */
export interface EngineStatus {
  readonly playing: boolean
  readonly beat: number
  /** Loudest output sample (0..1) since the previous status snapshot. */
  readonly peak: number
  readonly tracks: Readonly<Record<string, LauncherStatus>>
}
