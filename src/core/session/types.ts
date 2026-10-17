/** Runtime ownership. Source is namespaced by the engine; id distinguishes repeated notes. */
export interface NoteIdentity {
  readonly source: string
  readonly channel: number
  readonly id: string
  /** Route/generated-event tokens; kept flat to avoid repeatedly escaping nested IDs. */
  readonly path?: readonly (string | number)[]
}
export interface NoteScope {
  readonly source: string
  readonly channel?: number
}

/** Runtime musical event at an absolute beat. Engine streams always carry identity; legacy pure callers may omit it. */
export type NoteEvent =
  | { readonly beat: number; readonly kind: 'noteOn'; readonly pitch: number; readonly velocity: number; readonly identity?: NoteIdentity }
  | { readonly beat: number; readonly kind: 'noteOff'; readonly pitch: number; readonly identity?: NoteIdentity }
  | { readonly beat: number; readonly kind: 'allOff'; readonly scope?: NoteScope }

import type { AudioClip } from '../project'

/** Start or stop of an audio clip at an absolute transport beat. */
export type AudioEvent =
  | { readonly beat: number; readonly kind: 'start'; readonly clip: AudioClip }
  | { readonly beat: number; readonly kind: 'stop' }

/** What the UI needs to draw a track's launch state. */
export interface LauncherStatus {
  readonly playingClipId: string | null
  /** Transport beat at which the playing clip's loop began, for playhead display. */
  readonly startBeat: number | null
  /** Clip id waiting for the next quantize boundary, 'stop' for a queued stop, or null. */
  readonly queued: string | 'stop' | null
}
