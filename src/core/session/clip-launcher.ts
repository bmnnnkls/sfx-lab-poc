import type { Clip } from '../project'
import { LaunchQueue } from './launch-queue'
import type { LauncherStatus, NoteEvent } from './types'

/** A note that has started sounding and not yet ended, as it was when it started. */
interface HeldNote {
  readonly pitch: number
  readonly start: number
  /** Absolute beat at which the loop pass that triggered it began. */
  readonly loopBase: number
}

const KIND_PRIORITY: Record<NoteEvent['kind'], number> = { allOff: 0, noteOff: 1, noteOn: 2 }

const byTime = (a: NoteEvent, b: NoteEvent): number =>
  a.beat - b.beat || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]

/**
 * Plays one clip at a time on a single track, Ableton-style: launching queues the
 * clip, which takes over at the next quantize boundary and then loops.
 */
export class ClipLauncher {
  private readonly queue: LaunchQueue<Clip>
  private readonly held = new Map<string, HeldNote>()
  /** Pitches to release at the start of the next range (their notes were edited away mid-sound). */
  private pendingReleases: number[] = []
  /** End of the last range handed out: the current play position. */
  private cursorBeat = 0

  constructor(quantizeBeats = 4) {
    this.queue = new LaunchQueue<Clip>(quantizeBeats)
  }

  private get playback() {
    return this.queue.playback
  }

  launch(clip: Clip): void {
    this.queue.launch(clip)
  }

  /** Queues a stop at the next boundary. */
  stop(): void {
    this.queue.stop()
  }

  /** Drops all state immediately (transport stopped). */
  reset(): void {
    this.queue.reset()
    this.held.clear()
    this.pendingReleases = []
  }

  /**
   * Swaps in edited clip data while playing/queued, or stops if the clip is gone. Notes that are
   * sounding right now but were deleted, moved, re-pitched or cut short by the edit are released,
   * so editing a running clip never leaves a note stuck on.
   */
  syncClips(clips: readonly (Clip | null)[]): void {
    this.queue.sync(clips)
    this.releaseStaleNotes()
  }

  status(): LauncherStatus {
    return this.queue.status()
  }

  /**
   * Events in the half-open beat range [from, to), sorted by time. Ranges must be
   * contiguous across calls so every event is emitted exactly once.
   */
  collectEvents(from: number, to: number): NoteEvent[] {
    const events: NoteEvent[] = this.pendingReleases.map((pitch) => ({
      beat: from,
      kind: 'noteOff',
      pitch,
    }))
    this.pendingReleases = []
    let cursor = from

    const boundary = this.queue.pendingBoundary(from, to)
    if (boundary !== null) {
      events.push(...this.clipEvents(cursor, boundary))
      events.push({ beat: boundary, kind: 'allOff' })
      this.held.clear()
      this.queue.commit(boundary)
      cursor = boundary
    }

    events.push(...this.clipEvents(cursor, to))
    this.cursorBeat = to
    return events.sort(byTime)
  }

  private releaseStaleNotes(): void {
    const clip = this.playback?.clip
    for (const [id, held] of this.held) {
      const note = clip?.notes.find((candidate) => candidate.id === id)
      const stillValid =
        clip !== undefined &&
        note !== undefined &&
        note.pitch === held.pitch &&
        note.start === held.start &&
        held.loopBase + Math.min(note.start + note.duration, clip.lengthBeats) >= this.cursorBeat
      if (!stillValid) {
        this.pendingReleases.push(held.pitch)
        this.held.delete(id)
      }
    }
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
          this.held.set(note.id, { pitch: note.pitch, start: note.start, loopBase: startBeat + loopStart })
        }
        if (off >= localFrom && off < localTo) {
          events.push({ beat: startBeat + off, kind: 'noteOff', pitch: note.pitch })
          this.held.delete(note.id)
        }
      }
    }
    return events
  }
}
