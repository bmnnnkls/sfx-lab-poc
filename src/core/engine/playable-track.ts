import type { TapBoard } from '../notefx'
import type { Patch } from '../patch'
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
  /**
   * Events falling in the beat range [from, to), each to be run at its beat's sample. `board` is where tracks
   * share the notes they produced in this range: a track writes its own and reads those of the tracks it takes
   * notes from (the engine runs those first).
   */
  schedule(from: number, to: number, board: TapBoard): ScheduledAction[]
  /** Ids of the tracks this one takes notes from. */
  tapSources(): string[]
  /** Replaces the insert graph. Structural changes restart it (its tails are lost); knob changes go through `setParam`. */
  setFx(fx: Patch): void
  /** Changes a parameter of a node in the track's patch or insert graph (node ids are unique across both). */
  setParam(nodeId: string, paramId: string, value: number): void
  setSample(nodeId: string, sampleId: string | null): void
  /** Adds `frames` samples of this track, scaled by its volume, after its insert graph and fader, into the stereo buses. */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, timing: MixTiming): void
}
