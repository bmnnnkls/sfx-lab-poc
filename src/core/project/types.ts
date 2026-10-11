import type { ModuleDefinition, Patch } from '../patch'
import type { SampleInfo } from '../sample'

export interface Note {
  /** Stable identity, so selections and held notes survive edits and undo. */
  readonly id: string
  /** MIDI pitch, 60 = middle C. */
  readonly pitch: number
  /** Start within the clip, in beats. */
  readonly start: number
  readonly duration: number
  /** 0..1 */
  readonly velocity: number
}

export interface Clip {
  readonly id: string
  readonly name: string
  readonly lengthBeats: number
  readonly notes: readonly Note[]
}

/**
 * How an audio clip relates to the project tempo.
 * - `repitch`: the clip spans `lengthBeats` beats and is sped up or slowed down to fit, so it stays locked to
 *   the grid at any tempo. Pitch follows speed (like Ableton's Re-Pitch mode).
 * - `off`: plays at its original speed, unaffected by tempo.
 */
export type WarpMode = 'repitch' | 'off'

/** A library sample placed in a slot of an audio track. */
export interface AudioClip {
  readonly id: string
  readonly name: string
  /** Which library sample to play. */
  readonly sampleId: string
  /** Length of one pass through the sample, in beats. Sets the loop length and, in `repitch` mode, the speed. */
  readonly lengthBeats: number
  readonly loop: boolean
  readonly warp: WarpMode
  /** 0..2, 1 = unchanged. */
  readonly gain: number
  /** Where the played region starts, as a fraction (0..1) of the whole sample. */
  readonly start: number
  /** Where it ends (> `start`, <= 1). In re-pitch mode this region is what fits `lengthBeats`; when looping it is what repeats. */
  readonly end: number
  /** Fade-in at the start of each pass, in seconds of the sample's own time (so it is the same at any tempo). */
  readonly fadeIn: number
  /** Fade-out at the end of each pass, likewise. */
  readonly fadeOut: number
}

interface TrackBase {
  readonly id: string
  readonly name: string
  readonly volume: number
  /**
   * The insert graph after the track's own sound and before its fader: `Track in` -> effects -> `Track out`.
   * A fresh track has just those two, wired together (the sound passes through unchanged).
   */
  readonly fx: Patch
}

/**
 * What a track sends to each return track with its send knobs: return track id -> level (0..1, absent = nothing). The
 * knob takes the sound after the insert graph and the fader (post-fader); a Send node in the insert graph takes it
 * wherever it sits, and the two add together.
 */
export type SendLevels = Readonly<Record<string, number>>

/** Plays MIDI clips through a patch (a synth or sampler). */
export interface InstrumentTrack extends TrackBase {
  readonly kind: 'instrument'
  readonly sends: SendLevels
  /** Maximum simultaneous notes; further notes steal the oldest voice. */
  readonly voices: number
  readonly patch: Patch
  /**
   * The note graph between the clips and the instrument: nodes (effects, splits, notes from other tracks) wired
   * from `clipNotes` to `noteOut`. A fresh track has just those two, wired together.
   */
  readonly noteGraph: Patch
  /** One slot per scene (row) of the session grid; null = empty slot. */
  readonly clips: readonly (Clip | null)[]
}

/** Plays audio clips (library samples) straight to the mix. */
export interface AudioTrack extends TrackBase {
  readonly kind: 'audio'
  readonly sends: SendLevels
  readonly clips: readonly (AudioClip | null)[]
}

/**
 * A return (send/aux) track: no clips. Its insert graph starts at `Return in`, the sum of what other tracks send to it
 * (with Send nodes), so one reverb or delay can serve several tracks. It is mixed like any track, after the tracks that
 * send to it.
 */
export interface ReturnTrack extends TrackBase {
  readonly kind: 'return'
}

export type Track = InstrumentTrack | AudioTrack | ReturnTrack

/** The saveable document. Everything the user authors lives here. */
export interface Project {
  readonly name: string
  readonly tempo: number
  readonly sceneCount: number
  /** The sample library: audio used (or usable) by this project. Bytes are stored separately. */
  readonly samples: readonly SampleInfo[]
  /** Reusable sub-patches (of sound or of notes). Patches use them by id, so editing one changes every use. */
  readonly modules: readonly ModuleDefinition[]
  readonly tracks: readonly Track[]
}
