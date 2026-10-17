import { automationValue, type AutomationClip, type AutomationTrack, type PlaybackLane } from '../automation'
import { controlTargetKey, type ControlTarget, type ControlValue } from '../control'
import { LaunchQueue, type LauncherStatus } from '../session'

/** Runtime ownership only. The same clock/queue and evaluator are used in the worklet and offline engine. */
export class EngineAutomation {
  private tracks = new Map<string, { clips: AutomationTrack['clips']; queue: LaunchQueue<AutomationClip> }>()
  private active = new Map<string, { lane: PlaybackLane; value: number }>()
  overrideRevision = 0
  private overrides = new Map<string, ControlValue>()
  constructor(private readonly write: (target: ControlTarget, value: number, baseValue?: number) => void) {}
  configure(tracks: readonly AutomationTrack[], statuses: ReadonlyMap<string, LauncherStatus>): void {
    // Restore old targets first, including removed/replaced/wired references.
    this.restore()
    const next = new Map<string, { clips: AutomationTrack['clips']; queue: LaunchQueue<AutomationClip> }>()
    for (const track of tracks) {
      const queue = this.tracks.get(track.trackId)?.queue ?? new LaunchQueue<AutomationClip>()
      const status = statuses.get(track.trackId)
      if (!this.tracks.has(track.trackId) && status?.playingClipId && status.startBeat !== null) {
        const clip = track.clips.find((clip) => clip?.id === status.playingClipId)
        if (clip) queue.playback = { clip, startBeat: status.startBeat }
      }
      if (!this.tracks.has(track.trackId) && status?.queued) {
        const queued = track.clips.find((clip) => clip?.id === status.queued)
        if (queued) queue.launch(queued)
        else if (status.queued === 'stop') queue.stop()
      }
      queue.sync(track.clips)
      next.set(track.trackId, { clips: track.clips, queue })
    }
    this.tracks = next
  }
  setOverrides(values: readonly ControlValue[], revision = 0): void {
    this.overrideRevision = revision
    this.overrides = new Map(values.map((entry) => [controlTargetKey(entry.target), entry]))
    for (const entry of values) this.write(entry.target, entry.value)
  }
  launch(trackId: string, clipId: string): void {
    const track = this.tracks.get(trackId), clip = track?.clips.find((clip) => clip?.id === clipId)
    if (clip) track!.queue.launch(clip)
  }
  scene(scene: number): void { for (const track of this.tracks.values()) { const clip = track.clips[scene]; if (clip) track.queue.launch(clip); else track.queue.stop() } }
  finish(trackId: string): void { const queue = this.tracks.get(trackId)?.queue; if (queue) queue.playback = null }
  stopTrack(trackId: string): void { this.tracks.get(trackId)?.queue.stop() }
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
        for (const [key, entry] of this.overrides) if (entry.target.owner.kind === 'track' && entry.target.owner.trackId === trackId) this.overrides.delete(key)
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
