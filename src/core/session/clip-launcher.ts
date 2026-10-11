import type { Clip } from '../project'
import type { LauncherStatus, NoteEvent } from './types'

interface Playback {
  readonly clip: Clip
  readonly startBeat: number
}

type Queued = { readonly clip: Clip } | { readonly clip: null }

const KIND_PRIORITY: Record<NoteEvent['kind'], number> = { allOff: 0, noteOff: 1, noteOn: 2 }

const byTime = (a: NoteEvent, b: NoteEvent): number =>
  a.beat - b.beat || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]

/**
 * Plays one clip at a time on a single track, Ableton-style: launching queues the
 * clip, which takes over at the next quantize boundary and then loops.
 */
export class ClipLauncher {
  private playback: Playback | null = null
  private queued: Queued | null = null

  constructor(private readonly quantizeBeats = 4) {}

  launch(clip: Clip): void {
    this.queued = { clip }
  }

  /** Queues a stop at the next boundary. */
  stop(): void {
    if (this.playback) this.queued = { clip: null }
  }

  /** Drops all state immediately (transport stopped). */
  reset(): void {
    this.playback = null
    this.queued = null
  }

  /** Swaps in edited clip data while playing/queued, or stops if the clip is gone. */
  syncClips(clips: readonly (Clip | null)[]): void {
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

  status(): LauncherStatus {
    return {
      playingClipId: this.playback?.clip.id ?? null,
      startBeat: this.playback?.startBeat ?? null,
      queued: this.queued ? (this.queued.clip?.id ?? 'stop') : null,
    }
  }

  /**
   * Events in the half-open beat range [from, to), sorted by time. Ranges must be
   * contiguous across calls so every event is emitted exactly once.
   */
  collectEvents(from: number, to: number): NoteEvent[] {
    const events: NoteEvent[] = []
    let cursor = from

    if (this.queued) {
      const boundary = Math.ceil(from / this.quantizeBeats) * this.quantizeBeats
      if (boundary < to) {
        events.push(...this.clipEvents(cursor, boundary))
        events.push({ beat: boundary, kind: 'allOff' })
        this.playback = this.queued.clip ? { clip: this.queued.clip, startBeat: boundary } : null
        this.queued = null
        cursor = boundary
      }
    }

    events.push(...this.clipEvents(cursor, to))
    return events.sort(byTime)
  }

  private clipEvents(from: number, to: number): NoteEvent[] {
    if (!this.playback || to <= from) return []
    const { clip, startBeat } = this.playback
    const length = clip.lengthBeats
    const localFrom = from - startBeat
    const localTo = to - startBeat
    const events: NoteEvent[] = []

    // Start one loop early: a note that ends exactly on a loop boundary belongs to the previous pass.
    const firstLoop = Math.max(0, Math.floor(localFrom / length) - 1)
    const lastLoop = Math.floor(localTo / length)
    for (let loop = firstLoop; loop <= lastLoop; loop++) {
      const loopStart = loop * length
      for (const note of clip.notes) {
        if (note.start >= length) continue
        const on = loopStart + note.start
        const off = loopStart + Math.min(note.start + note.duration, length)
        if (on >= localFrom && on < localTo) {
          events.push({ beat: startBeat + on, kind: 'noteOn', pitch: note.pitch, velocity: note.velocity })
        }
        if (off >= localFrom && off < localTo) {
          events.push({ beat: startBeat + off, kind: 'noteOff', pitch: note.pitch })
        }
      }
    }
    return events
  }
}
