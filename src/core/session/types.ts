/** Musical event emitted by a clip player at an absolute transport beat. */
export type NoteEvent =
  | { readonly beat: number; readonly kind: 'noteOn'; readonly pitch: number; readonly velocity: number }
  | { readonly beat: number; readonly kind: 'noteOff'; readonly pitch: number }
  | { readonly beat: number; readonly kind: 'allOff' }

/** What the UI needs to draw a track's launch state. */
export interface LauncherStatus {
  readonly playingClipId: string | null
  /** Clip id waiting for the next quantize boundary, 'stop' for a queued stop, or null. */
  readonly queued: string | 'stop' | null
}
