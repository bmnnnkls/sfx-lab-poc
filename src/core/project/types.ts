import type { Patch } from '../patch'
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

export interface Track {
  readonly id: string
  readonly name: string
  readonly volume: number
  /** Maximum simultaneous notes; further notes steal the oldest voice. */
  readonly voices: number
  readonly patch: Patch
  /** One slot per scene (row) of the session grid; null = empty slot. */
  readonly clips: readonly (Clip | null)[]
}

/** The saveable document. Everything the user authors lives here. */
export interface Project {
  readonly name: string
  readonly tempo: number
  readonly sceneCount: number
  /** The sample library: audio used (or usable) by this project. Bytes are stored separately. */
  readonly samples: readonly SampleInfo[]
  readonly tracks: readonly Track[]
}
