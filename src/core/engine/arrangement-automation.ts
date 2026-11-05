import type { PlaybackLane, TimelineAutomation, TimelineRegionLanes } from '../automation'
import { controlTargetKey } from '../control'

const EPSILON = 1e-10

/** Where a lane plays at a beat: the lane and the beat to evaluate it at (song beats, or the region's phase). */
export type LaneVisit = (lane: PlaybackLane, beat: number) => void

/**
 * Which lanes play while the arrangement plays, from the position, the way `ArrangementPlayer` answers which regions
 * sound. Per target, at most one source: a timeline lane of its owner while it is enabled and has points, else a lane
 * of the region playing on that track (the newest start under the beat), else none, so the target keeps its base.
 * Nothing here is per sample: the regions under the beat are found once and kept until the beat leaves their span.
 */
export class ArrangementAutomation {
  private owners: readonly PlaybackLane[] = []
  /** Targets a timeline lane takes; a region's lane on one of them stays silent. */
  private taken = new Set<string>()
  private keys = new Map<PlaybackLane, string>()
  private byTrack = new Map<string, readonly TimelineRegionLanes[]>()
  /** The region playing on each track at the prepared beat, and the span of beats that stays true for. */
  private playing: TimelineRegionLanes[] = []
  private from = Infinity
  private to = -Infinity

  configure(timeline: TimelineAutomation | undefined): void {
    this.owners = timeline?.owners.flatMap((entry) => entry.lanes) ?? []
    this.keys = new Map()
    for (const lane of this.owners) this.keys.set(lane, controlTargetKey(lane.target))
    this.taken = new Set(this.owners.filter(playable).map((lane) => this.keys.get(lane)!))
    const byTrack = new Map<string, TimelineRegionLanes[]>()
    for (const region of timeline?.regions ?? []) {
      for (const lane of region.lanes) this.keys.set(lane, controlTargetKey(lane.target))
      const list = byTrack.get(region.trackId) ?? []
      list.push(region)
      byTrack.set(region.trackId, list)
    }
    // Sorted by start, a stable sort: of two equal starts the later in the list wins, as for audio.
    for (const list of byTrack.values()) list.sort((a, b) => a.start - b.start)
    this.byTrack = byTrack
    this.forget()
  }

  get configured(): boolean { return this.owners.length > 0 || this.byTrack.size > 0 }

  /** Whether any lane here addresses a note graph (a structural diagnostic). */
  get noteLanes(): boolean {
    for (const lane of this.keys.keys()) if (playable(lane) && lane.target.kind === 'graph' && lane.target.domain === 'notes') return true
    return false
  }

  /** Forgets the prepared regions (after a seek, the next beat finds them again). */
  forget(): void { this.from = Infinity; this.to = -Infinity }

  /** The key `controlTargetKey` gives a lane's target, computed once. */
  keyOf(lane: PlaybackLane): string { return this.keys.get(lane)! }

  /** Calls `visit` for each lane that plays at `beat`, with the beat to evaluate it at. */
  lanesAt(beat: number, visit: LaneVisit): void {
    this.prepare(beat)
    for (const lane of this.owners) visit(lane, beat)
    for (const region of this.playing) {
      const local = beat - region.start
      const phase = Math.max(0, local - Math.floor((local + EPSILON) / region.length) * region.length)
      for (const lane of region.lanes) if (!this.taken.has(this.keys.get(lane)!)) visit(lane, phase)
    }
  }

  /**
   * The lanes that play between `from` and `to`, for the caller's constant-range proof, each with the range to check
   * (in the beats it is evaluated at), or `null` when it can't be constant there: its region wraps inside the range,
   * or a region starts or ends inside it, which changes the source on that track.
   */
  lanesIn(from: number, to: number, visit: (lane: PlaybackLane, range: readonly [number, number] | null) => void): void {
    this.prepare(from)
    const edge = to > this.to + EPSILON
    for (const lane of this.owners) visit(lane, [from, to])
    for (const region of this.playing) {
      const local = from - region.start
      const pass = Math.floor((local + EPSILON) / region.length)
      const a = local - pass * region.length, b = to - region.start - pass * region.length
      const range = edge || b >= region.length ? null : ([Math.max(0, a), b] as const)
      for (const lane of region.lanes) if (!this.taken.has(this.keys.get(lane)!)) visit(lane, range)
    }
    if (edge) for (const list of this.byTrack.values()) for (const region of list) {
      if (region.end > from && region.start < to && !this.playing.includes(region)) for (const lane of region.lanes) visit(lane, null)
    }
  }

  private prepare(beat: number): void {
    if (beat >= this.from - EPSILON && beat < this.to - EPSILON) return
    this.playing = []
    let from = -Infinity, to = Infinity
    for (const list of this.byTrack.values()) {
      let current: TimelineRegionLanes | undefined
      for (const region of list) {
        if (region.start <= beat + EPSILON) {
          from = Math.max(from, region.start)
          if (region.end > beat + EPSILON) current = region
          else from = Math.max(from, region.end)
        } else to = Math.min(to, region.start)
        if (region.end > beat + EPSILON) to = Math.min(to, region.end)
      }
      if (current) this.playing.push(current)
    }
    this.from = from
    this.to = to
  }
}

const playable = (lane: PlaybackLane) => lane.enabled && lane.points.length > 0
