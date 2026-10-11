import type { LauncherStatus } from '../session'

/** Snapshot of engine state for display; produced by the engine, consumed by the UI. */
export interface EngineStatus {
  readonly playing: boolean
  readonly beat: number
  /** Loudest output sample (0..1) since the previous status snapshot. */
  readonly peak: number
  /**
   * Loudest sample (0..1) each track added to the output since the previous snapshot: after its fader, pan, mute and
   * solo, so it reads zero for a track that is not heard. Like `peak`, reading resets it.
   */
  readonly peaks: Readonly<Record<string, number>>
  readonly tracks: Readonly<Record<string, LauncherStatus>>
}
