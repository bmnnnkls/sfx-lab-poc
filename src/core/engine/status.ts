import type { LauncherStatus } from '../session'

/** Snapshot of engine state for display; produced by the engine, consumed by the UI. */
export interface EngineStatus {
  readonly playing: boolean
  readonly beat: number
  readonly tracks: Readonly<Record<string, LauncherStatus>>
}
