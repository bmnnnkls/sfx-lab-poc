import type { LauncherStatus } from '../session'

/** Something to do at an exact transport beat, produced by a track and run by the engine at the right sample. */
export interface ScheduledAction {
  readonly beat: number
  run(): void
}

/** Where in musical time a stretch of audio being rendered sits. */
export interface MixTiming {
  /** Transport beat at the first frame of the stretch. */
  readonly beat: number
  readonly beatsPerSample: number
}

/**
 * What the engine needs from any kind of track (instrument or audio): launching clips, scheduling their
 * events against the beat clock, and adding its audio to the mix. Each kind keeps its own clip type and
 * playback logic behind this.
 */
export interface PlayableTrack {
  volume: number
  launchClip(clipId: string): void
  /** Launches the clip in scene slot `scene`, or stops the track if that slot is empty. */
  launchScene(scene: number): void
  /** Queues a stop at the next bar. */
  stopClip(): void
  /** Back to silence and an idle launcher (transport stopped). */
  reset(): void
  status(): LauncherStatus
  /** Events falling in the beat range [from, to), each to be run at its beat's sample. */
  schedule(from: number, to: number): ScheduledAction[]
  /** Adds `frames` samples of this track, scaled by its volume, into the stereo buses. */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, timing: MixTiming): void
}
