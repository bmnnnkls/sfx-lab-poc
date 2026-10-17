import { arrangementEnd, arrangementOverlaps, isAudioContent } from '../project'
import type { ArrangementClip, AudioClip, Clip } from '../project'
import type { AudioEvent, NoteEvent, NoteIdentity } from '../session'

const KIND_PRIORITY: Record<NoteEvent['kind'], number> = { allOff: 0, noteOff: 1, noteOn: 2 }

const byTime = (a: NoteEvent, b: NoteEvent): number =>
  a.beat - b.beat || (KIND_PRIORITY[a.kind] ?? 0) - (KIND_PRIORITY[b.kind] ?? 0)

/**
 * Plays the arrangement timeline of one track: which regions sound is *derived from the transport
 * position* rather than queued, so seeking the transport mid-song plays what is under the playhead.
 * A region's timeline start is its loop origin; audio stays phase-locked exactly like session clips.
 * Regions are set whole (`setRegions`); playing notes are not tracked for release on edits — the
 * prototype limitation that replaces the session launchers' stale-note release.
 */
export class ArrangementPlayer {
  protected regions: readonly ArrangementClip[] = []

  setRegions(regions: readonly ArrangementClip[]): void {
    this.regions = regions
  }

  /** Stateless apart from the region list: a stopped transport simply plays nothing. */
  reset(): void {}

  /** Regions of this track that overlap the half-open beat range [from, to). */
  protected active(from: number, to: number): readonly ArrangementClip[] {
    if (to <= from) return []
    return this.regions.filter((region) => arrangementOverlaps(region, from, to))
  }
}

/** Note events of a track's arrangement, derived from the transport range. */
export class ArrangementNotes extends ArrangementPlayer {
  constructor(private readonly source: string) {
    super()
  }

  /**
   * Events in [from, to), sorted by time. Ranges must be contiguous so every event is emitted once.
   * A region is followed one boundary past its end, so a note that runs to the end is released there.
   */
  collectEvents(from: number, to: number): NoteEvent[] {
    const events: NoteEvent[] = []
    for (const region of this.regions) {
      if (!(region.startBeat < to && arrangementEnd(region) >= from)) continue
      const clip: Clip | AudioClip = region.content
      if (isAudioContent(clip)) continue
      events.push(...regionNoteEvents(clip, region, from, to, this.source))
    }
    return events.sort(byTime)
  }
}

/** The note events of one MIDI region. A region plays *once*, spanning its own length; notes are cut at its end. */
const regionNoteEvents = (
  clip: Clip,
  region: ArrangementClip,
  from: number,
  to: number,
  source: string,
): NoteEvent[] => {
  const localFrom = from - region.startBeat
  const localTo = to - region.startBeat
  const events: NoteEvent[] = []
  for (const note of clip.notes) {
    if (note.start >= clip.lengthBeats) continue
    const on = note.start
    const off = Math.min(note.start + note.duration, clip.lengthBeats)
    const identity: NoteIdentity = {
      source,
      channel: 0,
      id: JSON.stringify(['arr', region.id, note.id]),
    }
    if (on >= localFrom && on < localTo) {
      events.push({ beat: region.startBeat + on, kind: 'noteOn', pitch: note.pitch, velocity: note.velocity, identity })
    }
    if (off >= localFrom && off < localTo) {
      events.push({ beat: region.startBeat + off, kind: 'noteOff', pitch: note.pitch, identity })
    }
  }
  return events
}

/**
 * Start/stop events of a track's arrangement: a region starts when the transport reaches it — or, when
 * playback begins (or seeks) inside it, joins immediately in phase — and stops at its timeline end.
 */
export class ArrangementAudio extends ArrangementPlayer {
  /** What is currently playing per region id, so a seek into a region starts it at the seek position. */
  private playing = new Set<string>()

  reset(): void {
    this.playing = new Set()
  }

  /** Events in [from, to). Ranges must be contiguous. `origin` is the loop base the player derives its phase from. */
  collectEvents(from: number, to: number): AudioEvent[] {
    const events: AudioEvent[] = []
    for (const region of this.active(from, to)) {
      const clip = region.content
      if (!isAudioContent(clip)) continue
      const end = region.startBeat + clip.lengthBeats
      if (!this.playing.has(region.id)) {
        const inPhase = region.startBeat >= from && region.startBeat < to
        events.push({ beat: inPhase ? region.startBeat : from, kind: 'start', clip, origin: region.startBeat })
        this.playing.add(region.id)
      }
      if (this.playing.has(region.id) && end >= from && end < to) {
        events.push({ beat: end, kind: 'stop' })
        this.playing.delete(region.id)
      }
    }
    // Regions that were playing and are no longer active (moved away, deleted) stop now.
    for (const id of [...this.playing]) {
      if (!this.regions.some((region) => region.id === id && arrangementOverlaps(region, from, to))) {
        events.push({ beat: from, kind: 'stop' })
        this.playing.delete(id)
      }
    }
    return events.sort((a, b) => a.beat - b.beat)
  }
}
