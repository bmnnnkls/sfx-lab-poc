import { automationOwnerKey, automationPosition, automationValue, type AutomationClip, type AutomationTrack, type PlaybackLane, type TimelineAutomation } from '../automation'
import { controlTargetKey, type ControlOwner, type ControlTarget, type ControlValue } from '../control'
import { LaunchQueue, type LauncherStatus } from '../session'
import { ArrangementAutomation } from './arrangement-automation'

/** Runtime ownership only. The same clock/queue and evaluator are used in the worklet and offline engine. */
export class EngineAutomation {
  private tracks = new Map<string, { clips: AutomationTrack['clips']; slots: boolean; queue: LaunchQueue<AutomationClip> }>()
  private active = new Map<string, { lane: PlaybackLane; value: number }>()
  private next = new Map<string, { lane: PlaybackLane; value: number }>()
  private readonly metadata = new Map<PlaybackLane, { key: string; entry: { lane: PlaybackLane; value: number }; uniform: boolean }>()
  overrideRevision = 0
  private overrides = new Map<string, ControlValue>()
  /** While the arrangement plays, its lanes play instead of the launch queues'. */
  private readonly timeline = new ArrangementAutomation()
  private arrangement = false
  constructor(private readonly write: (target: ControlTarget, value: number, baseValue?: number) => void) {}
  /**
   * Follows the engine's playback mode. Switching restores what the other source was writing; into the arrangement,
   * the session's queues stop, as its launchers do.
   */
  setArrangement(on: boolean): void {
    if (on === this.arrangement) return
    this.restore()
    if (on) for (const track of this.tracks.values()) track.queue.reset()
    this.arrangement = on
    this.timeline.forget()
  }
  configure(tracks: readonly AutomationTrack[], statuses: ReadonlyMap<string, LauncherStatus>, timeline?: TimelineAutomation): void {
    // Deleting a playing dedicated slot releases its manual/MIDI ownership as well.
    for (const [key, previous] of this.tracks) {
      if (!previous.slots || !previous.queue.playback) continue
      const next = tracks.find((track) => track.slotOwner && automationOwnerKey(track.slotOwner) === key)
      if (!next?.clips.some((clip) => clip?.id === previous.queue.playback!.clip.id)) {
        for (const [targetKey, entry] of this.overrides) if (automationOwnerKey(entry.target.owner) === key) this.overrides.delete(targetKey)
      }
    }
    // Restore old targets first, including removed/replaced/wired references.
    this.restore()
    const next = new Map<string, { clips: AutomationTrack['clips']; slots: boolean; queue: LaunchQueue<AutomationClip> }>()
    for (const track of tracks) {
      const owner = track.slotOwner ?? { kind: 'track' as const, trackId: track.trackId }
      const key = automationOwnerKey(owner)
      const queue = this.tracks.get(key)?.queue ?? new LaunchQueue<AutomationClip>()
      const status = track.slotOwner ? undefined : statuses.get(track.trackId)
      if (!this.tracks.has(key) && status?.playingClipId && status.startBeat !== null) {
        const clip = track.clips.find((clip) => clip?.id === status.playingClipId)
        if (clip) queue.playback = { clip, startBeat: status.startBeat }
      }
      if (!this.tracks.has(key) && status?.queued) {
        const queued = track.clips.find((clip) => clip?.id === status.queued)
        if (queued) queue.launch(queued)
        else if (status.queued === 'stop') queue.stop()
      }
      queue.sync(track.clips)
      next.set(key, { clips: track.clips, queue, slots: !!track.slotOwner })
    }
    this.tracks = next
    this.timeline.configure(timeline)
    this.metadata.clear()
    const lanes = [
      ...tracks.flatMap((track) => track.clips.flatMap((clip) => clip?.lanes ?? [])),
      ...(timeline?.owners.flatMap((entry) => entry.lanes) ?? []),
      ...(timeline?.regions.flatMap((region) => region.lanes) ?? []),
    ]
    for (const lane of lanes) this.metadata.set(lane, { key: controlTargetKey(lane.target), entry: { lane, value: lane.baseValue }, uniform: lane.points.every(point => point.value === lane.points[0]?.value) })
  }
  setOverrides(values: readonly ControlValue[], revision = 0): void {
    this.overrideRevision = revision
    this.overrides = new Map(values.map((entry) => [controlTargetKey(entry.target), entry]))
    for (const entry of values) this.write(entry.target, entry.value)
  }
  launch(trackId: string, clipId: string): void {
    const track = this.tracks.get(automationOwnerKey({ kind: 'track', trackId })), clip = track?.clips.find((clip) => clip?.id === clipId)
    if (clip) track!.queue.launch(clip)
  }
  launchSlot(owner: ControlOwner, slotId: string | null): void {
    const track = this.tracks.get(automationOwnerKey(owner))
    if (!track?.slots) return
    const clip = track.clips.find((clip) => clip?.id === slotId)
    if (clip) track.queue.launch(clip)
    else { track.queue.queued = { clip: null } }
  }
  slotStatus(owner: ControlOwner): LauncherStatus | undefined { const track = this.tracks.get(automationOwnerKey(owner)); return track?.slots ? track.queue.status() : undefined }
  /** Launches each owner's lanes in that scene; with `trackIds`, only those tracks' (not the returns' or the master's slots). */
  scene(scene: number, trackIds?: readonly string[]): void {
    const keys = trackIds && new Set(trackIds.map((trackId) => automationOwnerKey({ kind: 'track', trackId })))
    for (const [key, track] of this.tracks) {
      if (keys && !keys.has(key)) continue
      const clip = track.clips[scene]; if (clip) track.queue.launch(clip); else if (track.slots) track.queue.queued = { clip: null }; else track.queue.stop()
    }
  }
  finish(trackId: string): void { const queue = this.tracks.get(automationOwnerKey({ kind: 'track', trackId }))?.queue; if (queue) queue.playback = null }
  stopTrack(trackId: string): void { const track = this.tracks.get(automationOwnerKey({ kind: 'track', trackId })); if (track?.slots) track.queue.queued = { clip: null }; else track?.queue.stop() }
  reset(): void { this.overrides.clear(); this.restore(); for (const track of this.tracks.values()) track.queue.reset(); this.timeline.forget() }
  private restore(): void {
    for (const [key, entry] of this.active) this.write(entry.lane.target, this.overrides.get(key)?.value ?? entry.lane.baseValue)
    this.active.clear()
  }
  /** Queues commit before scheduling notes, so note-graph parameters see the new lane at launch. */
  tick(from: number, to: number): void {
    const next = this.next
    next.clear()
    if (this.arrangement) this.timeline.lanesAt(from, this.visit)
    else for (const [trackId, track] of this.tracks) {
      const boundary = track.queue.pendingBoundary(from - 1e-10, to - 1e-10)
      if (boundary !== null) {
        track.queue.commit(boundary)
        for (const [key, entry] of this.overrides) if (automationOwnerKey(entry.target.owner) === trackId) this.overrides.delete(key)
      }
      const playback = track.queue.playback
      if (!playback) continue
      const { clip, startBeat } = playback
      const local = Math.max(0, from - startBeat)
      const phase = Math.max(0, local - Math.floor((local + 1e-10) / clip.lengthBeats) * clip.lengthBeats)
      for (const lane of clip.lanes) {
        const value = automationValue(lane, phase)
        if (value !== undefined) {
          const meta = this.metadata.get(lane)!
          // Each lane owns its entry; both evaluation maps borrow it until the next tick.
          meta.entry.value = value
          next.set(meta.key, meta.entry)
        }
      }
    }
    for (const [key, previous] of this.active) if (!next.has(key)) this.write(previous.lane.target, this.overrides.get(key)?.value ?? previous.lane.baseValue)
    for (const [key, entry] of next) {
      this.write(entry.lane.target, this.overrides.get(key)?.value ?? entry.value, entry.lane.baseValue)
    }
    this.next = this.active
    this.active = next
  }
  /** A lane playing on the timeline, evaluated at `beat`; bound once, so a tick allocates nothing. */
  private readonly visit = (lane: PlaybackLane, beat: number): void => {
    const value = automationValue(lane, beat)
    if (value === undefined) return
    const meta = this.metadata.get(lane)!
    meta.entry.value = value
    this.next.set(meta.key, meta.entry)
  }
  /** Only provably constant note controls may use interval processors. Helpers are handled by the caller.
   * Called after the first sample tick: ownership/restoration at the horizon start has already committed.
   * A queued transition inside the horizon conservatively retains sample cadence on both sides.
   */
  noteOwners(into: Set<string>, from: number, to: number): void {
    if (this.arrangement) {
      this.timeline.lanesIn(from, to, (lane, range) => {
        const meta = this.metadata.get(lane)!
        if (range && (this.overrides.has(meta.key) || meta.uniform)) return
        if (!range || !constantPosition(lane, range[0], range[1])) this.addNoteOwner(into, lane)
      })
      return
    }
    for (const { queue } of this.tracks.values()) {
      const boundary = queue.pendingBoundary(from - 1e-10, to - 1e-10)
      if (boundary !== null) {
        for (const clip of [queue.playback?.clip, queue.queued?.clip]) for (const lane of clip?.lanes ?? []) this.addNoteOwner(into, lane)
        continue
      }
      const playback = queue.playback
      if (!playback) continue
      const { clip, startBeat } = playback
      const local = Math.max(0, from - startBeat), end = Math.max(0, to - startBeat)
      const loop = Math.floor((local + 1e-10) / clip.lengthBeats)
      const phase = Math.max(0, local - loop * clip.lengthBeats)
      const endPhase = Math.max(0, end - loop * clip.lengthBeats)
      for (const lane of clip.lanes) {
        const meta = this.metadata.get(lane)!
        if (this.overrides.has(meta.key) || meta.uniform) continue
        if (endPhase >= clip.lengthBeats || !constantPosition(lane, phase, endPhase)) this.addNoteOwner(into, lane)
      }
    }
  }
  private addNoteOwner(into: Set<string>, lane: PlaybackLane): void {
    if (lane.enabled && lane.points.length && lane.target.kind === 'graph' && lane.target.domain === 'notes' && lane.target.owner.kind === 'track') into.add(lane.target.owner.trackId)
  }
  /** Kept for the structural diagnostic; render planning uses reusable owner/component sets. */
  get noteLanes(): boolean {
    if (this.arrangement) return this.timeline.noteLanes
    for (const { queue } of this.tracks.values()) for (const clip of [queue.playback?.clip, queue.queued?.clip]) {
      if (clip?.lanes.some(lane => lane.enabled && lane.points.length && lane.target.kind === 'graph' && lane.target.domain === 'notes')) return true
    }
    return false
  }
  /** Whether anything can play in the current mode; with nothing, a block needs no planning horizon. */
  get configured(): boolean { return this.arrangement ? this.timeline.configured : this.tracks.size > 0 }
  overrideValues(): readonly ControlValue[] { return [...this.overrides.values()] }
  /** Copy ownership that must survive planning a later queued transition in this horizon. */
  copyOverrides(into: Map<string, number>): void {
    into.clear()
    for (const [key, entry] of this.overrides) into.set(key, entry.value)
  }
  readouts(): readonly ControlValue[] { return [...this.active.values()].map(({ lane, value }) => ({ target: lane.target, value })) }
}

/** Equal endpoints alone are insufficient: a hold or ramp can leave and return within the range.
 * Compare normalized positions conservatively (even where rounding would produce the same scalar).
 */
const constantPosition = (lane: PlaybackLane, from: number, to: number): boolean => {
  const value = automationPosition(lane, from, lane.discrete)
  if (automationPosition(lane, to, lane.discrete) !== value) return false
  const points = lane.points
  let lo = 0, hi = points.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid]!.beat < from - 1e-10) lo = mid + 1; else hi = mid }
  for (let i = lo; i < points.length && points[i]!.beat <= to + 1e-10; i++) if (points[i]!.value !== value) return false
  return true
}
