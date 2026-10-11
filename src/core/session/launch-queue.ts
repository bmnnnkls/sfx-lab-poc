import type { LauncherStatus } from './types'

interface Playback<C> {
  readonly clip: C
  readonly startBeat: number
}

type Queued<C> = { readonly clip: C } | { readonly clip: null }

/**
 * The Ableton-style launch state machine shared by MIDI and audio clips: launching or stopping is
 * *queued* and takes effect at the next quantize boundary (a bar by default). What a clip actually
 * does once it is playing is up to the launcher that owns the queue.
 */
export class LaunchQueue<C extends { readonly id: string }> {
  playback: Playback<C> | null = null
  queued: Queued<C> | null = null

  constructor(private readonly quantizeBeats = 4) {}

  launch(clip: C): void {
    this.queued = { clip }
  }

  /** Queues a stop at the next boundary (only if something is playing). */
  stop(): void {
    if (this.playback) this.queued = { clip: null }
  }

  /** Drops all state immediately (transport stopped). */
  reset(): void {
    this.playback = null
    this.queued = null
  }

  /** Swaps in edited clip data for what is playing or queued; a clip that no longer exists is dropped. */
  sync(clips: readonly (C | null)[]): void {
    const find = (id: string) => clips.find((clip) => clip?.id === id) ?? null
    if (this.playback) {
      const clip = find(this.playback.clip.id)
      this.playback = clip ? { ...this.playback, clip } : null
    }
    if (this.queued?.clip) {
      const clip = find(this.queued.clip.id)
      this.queued = clip ? { clip } : null
    }
  }

  /** The beat at which the queued change takes effect, if that falls in [from, to). */
  pendingBoundary(from: number, to: number): number | null {
    if (!this.queued) return null
    const boundary = Math.ceil(from / this.quantizeBeats) * this.quantizeBeats
    return boundary < to ? boundary : null
  }

  /** Applies the queued change at `boundary` (a value returned by `pendingBoundary`). */
  commit(boundary: number): void {
    if (!this.queued) return
    this.playback = this.queued.clip ? { clip: this.queued.clip, startBeat: boundary } : null
    this.queued = null
  }

  status(): LauncherStatus {
    return {
      playingClipId: this.playback?.clip.id ?? null,
      startBeat: this.playback?.startBeat ?? null,
      queued: this.queued ? (this.queued.clip?.id ?? 'stop') : null,
    }
  }
}
