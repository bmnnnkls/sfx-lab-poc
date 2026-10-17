import { automationOwnerKey, automationValue, type AutomationClip, type AutomationTrack, type PlaybackLane } from '../automation'
import { controlTargetKey, type ControlOwner, type ControlTarget, type ControlValue } from '../control'
import { LaunchQueue, type LauncherStatus } from '../session'

/** Runtime ownership only. The same clock/queue and evaluator are used in the worklet and offline engine. */
export class EngineAutomation {
  private tracks = new Map<string, { clips: AutomationTrack['clips']; slots: boolean; queue: LaunchQueue<AutomationClip> }>()
  private active = new Map<string, { lane: PlaybackLane; value: number }>()
  overrideRevision = 0
  private overrides = new Map<string, ControlValue>()
  constructor(private readonly write: (target: ControlTarget, value: number, baseValue?: number) => void) {}
  configure(tracks: readonly AutomationTrack[], statuses: ReadonlyMap<string, LauncherStatus>): void {
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
  scene(scene: number): void { for (const track of this.tracks.values()) { const clip = track.clips[scene]; if (clip) track.queue.launch(clip); else if (track.slots) track.queue.queued = { clip: null }; else track.queue.stop() } }
  finish(trackId: string): void { const queue = this.tracks.get(automationOwnerKey({ kind: 'track', trackId }))?.queue; if (queue) queue.playback = null }
  stopTrack(trackId: string): void { const track = this.tracks.get(automationOwnerKey({ kind: 'track', trackId })); if (track?.slots) track.queue.queued = { clip: null }; else track?.queue.stop() }
  reset(): void { this.overrides.clear(); this.restore(); for (const track of this.tracks.values()) track.queue.reset() }
  private restore(): void {
    for (const [key, entry] of this.active) this.write(entry.lane.target, this.overrides.get(key)?.value ?? entry.lane.baseValue)
    this.active.clear()
  }
  /** Queues commit before scheduling notes, so note-graph parameters see the new lane at launch. */
  tick(from: number, to: number): void {
    const next = new Map<string, { lane: PlaybackLane; value: number }>()
    for (const [trackId, track] of this.tracks) {
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
        if (value !== undefined) next.set(controlTargetKey(lane.target), { lane, value })
      }
    }
    for (const [key, previous] of this.active) if (!next.has(key)) this.write(previous.lane.target, this.overrides.get(key)?.value ?? previous.lane.baseValue)
    for (const [key, entry] of next) {
      this.write(entry.lane.target, this.overrides.get(key)?.value ?? entry.value, entry.lane.baseValue)
    }
    this.active = next
  }
  /** Idle projects retain the normal block render path. */
  get noteLanes(): boolean { return [...this.tracks.values()].some(({ queue }) => [queue.playback?.clip, queue.queued?.clip].some((clip) => clip?.lanes.some((lane) => lane.enabled && lane.points.length && lane.target.kind === 'graph' && lane.target.domain === 'notes'))) }
  get configured(): boolean { return this.tracks.size > 0 }
  overrideValues(): readonly ControlValue[] { return [...this.overrides.values()] }
  readouts(): readonly ControlValue[] { return [...this.active.values()].map(({ lane, value }) => ({ target: lane.target, value })) }
}
