import { arrangementLoopEnd, isAudioContent } from '../project'
import type { ArrangementClip, AudioClip, Clip } from '../project'
import type { AudioEvent, NoteEvent, NoteIdentity } from '../session'

const KIND_PRIORITY: Record<NoteEvent['kind'], number> = { allOff: 0, noteOff: 1, noteOn: 2 }

const byTime = (a: NoteEvent, b: NoteEvent): number =>
  a.beat - b.beat || (KIND_PRIORITY[a.kind] ?? 0) - (KIND_PRIORITY[b.kind] ?? 0)

/**
 * Plays the arrangement timeline of one track: which regions sound is *derived from the transport
 * position* rather than queued, so seeking the transport mid-song plays what is under the playhead.
 * A region's timeline start is its loop origin; audio stays phase-locked exactly like session clips.
 * A looping region repeats its clip until the next region on the track (`arrangementLoopEnd`).
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

  /**
   * Regions of this track that sound anywhere in the half-open beat range [from, to): a looping
   * region spans from its start to the next region on the track, not to its own end.
   */
  protected active(from: number, to: number): readonly ArrangementClip[] {
    if (to <= from) return []
    return this.regions.filter((region) => this.soundsIn(region, from, to))
  }

  /** Whether `region` sounds anywhere in [from, to) (the boundary included, so notes release there). */
  protected soundsIn(region: ArrangementClip, from: number, to: number): boolean {
    return region.startBeat < to && arrangementLoopEnd(region, this.regions) >= from
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
      if (!this.soundsIn(region, from, to)) continue
      const clip: Clip | AudioClip = region.content
      if (isAudioContent(clip)) continue
      events.push(...regionNoteEvents(clip, region, from, to, this.source, arrangementLoopEnd(region, this.regions)))
    }
    return events.sort(byTime)
  }
}

/**
 * The note events of one MIDI region. A non-looping region plays *once*, spanning its own length; notes are cut
 * at its end. A looping region repeats its clip, each pass cut at the pass end (a note runs at most to the end of
 * the clip), until the loop end — which may fall mid-pass and cut that pass short.
 */
const regionNoteEvents = (
  clip: Clip,
  region: ArrangementClip,
  from: number,
  to: number,
  source: string,
  loopEnd: number,
): NoteEvent[] => {
  const length = clip.lengthBeats
  const localFrom = from - region.startBeat
  const localTo = to - region.startBeat
  // The loop spans [start, loopEnd); passes are whole clips, the last one cut at the loop end.
  const span = loopEnd - region.startBeat
  const events: NoteEvent[] = []

  // Start one pass early: a note that ends exactly on a pass boundary belongs to the previous pass.
  const firstPass = Math.max(0, Math.floor(localFrom / length) - 1)
  for (let pass = firstPass; pass * length < span; pass++) {
    const passStart = pass * length
    const passEnd = Math.min(passStart + length, span)
    for (const note of clip.notes) {
      if (note.start >= passEnd - passStart) continue
      const on = passStart + note.start
      const off = passStart + Math.min(note.start + note.duration, passEnd - passStart)
      const identity: NoteIdentity = {
        source,
        channel: 0,
        id: JSON.stringify(region.loop ? ['arr', region.id, pass, note.id] : ['arr', region.id, note.id]),
      }
      if (on >= localFrom && on < localTo) {
        events.push({ beat: region.startBeat + on, kind: 'noteOn', pitch: note.pitch, velocity: note.velocity, identity })
      }
      if (off >= localFrom && off < localTo) {
        events.push({ beat: region.startBeat + off, kind: 'noteOff', pitch: note.pitch, identity })
      }
    }
  }
  return events
}

/**
 * Start/stop events of a track's arrangement: a region starts when the transport reaches it — or, when
 * playback begins (or seeks) inside it, joins immediately in phase — and stops at its loop end (its own
 * end, or the next region on the track when it loops). A looping region keeps its clip looping for the
 * whole span: the start event enables the clip's own loop so the read position wraps each pass.
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
      const end = arrangementLoopEnd(region, this.regions)
      if (!this.playing.has(region.id)) {
        const inPhase = region.startBeat >= from && region.startBeat < to
        events.push({ beat: inPhase ? region.startBeat : from, kind: 'start', clip: region.loop ? { ...clip, loop: true } : clip, origin: region.startBeat })
        this.playing.add(region.id)
      }
      if (this.playing.has(region.id) && end >= from && end < to) {
        events.push({ beat: end, kind: 'stop' })
        this.playing.delete(region.id)
      }
    }
    // Regions that were playing and are no longer active (moved away, deleted) stop now.
    for (const id of [...this.playing]) {
      const region = this.regions.find((candidate) => candidate.id === id)
      if (!region || !this.soundsIn(region, from, to)) {
        events.push({ beat: from, kind: 'stop' })
        this.playing.delete(id)
      }
    }
    return events.sort((a, b) => a.beat - b.beat)
  }
}
