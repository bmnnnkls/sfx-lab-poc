import type { TapBoard } from '../notefx'
import type { Patch } from '../patch'
import type { SendLevels } from '../project'
import type { LauncherStatus } from '../session'
import type { AudioBoard } from './audio-board'
import type { AudioTaps } from './audio-taps'
import type { ChannelStrip } from './channel-strip'

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

/** What the engine hands a track to mix into: where the stretch sits in musical time, and the boards tracks share sound on. */
export interface MixContext {
  readonly timing: MixTiming
  /** Sends to return tracks go here; a return track reads its own slot as its input. */
  readonly sends: AudioBoard
  /** Tracks write their sound here for Track audio nodes to read (the engine mixes the tracks they read from first). */
  readonly taps: AudioTaps
}

/**
 * What the engine needs from any kind of track (instrument or audio): launching clips, scheduling their
 * events against the beat clock, and adding its audio to the mix. Each kind keeps its own clip type and
 * playback logic behind this.
 */
export interface PlayableTrack {
  /** Fader, pan, mute/solo and meter: everything between the insert graph and the output. */
  readonly strip: ChannelStrip
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
  /** Ids of the return tracks this one sends to, from its insert graph or its send knobs (the engine mixes it before them). */
  sendTargets(): string[]
  /** Ids of the tracks this one takes audio from with Track audio nodes (the engine mixes it after them). */
  audioSources(): string[]
  /** Replaces the insert graph. Structural changes restart it (its tails are lost); knob changes go through `setParam`. */
  setFx(fx: Patch): void
  /** Changes a parameter of a node in the track's patch or insert graph (node ids are unique across both). */
  setParam(nodeId: string, paramId: string, value: number): void
  setSample(nodeId: string, sampleId: string | null): void
  /** What the indicators in the track's patch and insert graph show right now, by node id (empty when there are none). */
  readouts(): Readonly<Record<string, number>>
  /** The send knobs: how much of the track, after its fader, goes to each return track. */
  setSends(sends: SendLevels): void
  /**
   * Adds `frames` samples of this track, through its insert graph and through its channel strip, into the stereo buses, and
   * leaves its sound on the boards of `mix` for the tracks that send to or take audio from it.
   */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, mix: MixContext): void
}
