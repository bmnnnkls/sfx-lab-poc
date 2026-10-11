import type { Patch } from '../patch'

export interface Note {
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
  readonly patch: Patch
  /** One slot per scene (row) of the session grid; null = empty slot. */
  readonly clips: readonly (Clip | null)[]
}

/** The saveable document. Everything the user authors lives here. */
export interface Project {
  readonly name: string
  readonly tempo: number
  readonly sceneCount: number
  readonly tracks: readonly Track[]
}
