import { MAX_BLOCK_FRAMES } from '../instrument'
import type { TapBoard } from '../notefx'
import { SampleBank } from '../sample'
import type { LauncherStatus } from '../session'
import { Transport } from '../transport'
import { AudioBoard } from './audio-board'
import { AudioTrackRuntime } from './audio-track-runtime'
import type { EngineCommand } from './commands'
import type { PlayableTrack, ScheduledAction } from './playable-track'
import { ReturnTrackRuntime } from './return-track-runtime'
import { SamplePreview } from './sample-preview'
import type { EngineStatus } from './status'
import { TrackRuntime } from './track-runtime'

interface ScheduledEvent {
  readonly frame: number
  readonly action: ScheduledAction
}

/**
 * The whole audio engine behind two calls: `apply(command)` to change it and
 * `render(left, right)` to pull audio. Has no browser dependencies, so it runs the
 * same in an AudioWorklet, in Node tests, or in an offline bounce.
 */
export class Engine {
  private readonly transport: Transport
  private readonly tracks = new Map<string, PlayableTrack>()
  private readonly samples = new SampleBank()
  private readonly preview: SamplePreview
  private peak = 0
  /**
   * Tracks in the order they run: those that take notes from others, and return tracks, come after the tracks they
   * depend on. Rebuilt when tracks or graphs change.
   */
  private order: PlayableTrack[] | null = null
  /** What each track's note graph produced in the current block, for other tracks to read. */
  private readonly taps: TapBoard = new Map()
  /** What the tracks sent to each return track in the stretch being mixed. */
  private readonly sends = new AudioBoard()

  constructor(private readonly sampleRate: number) {
    this.transport = new Transport(sampleRate)
    this.preview = new SamplePreview(sampleRate)
  }

  apply(command: EngineCommand): void {
    switch (command.type) {
      case 'transport/play':
        this.transport.play()
        break
      case 'transport/stop':
        this.stopTransport()
        break
      case 'transport/setTempo':
        this.transport.setTempo(command.bpm)
        break
      case 'track/add':
        this.order = null
        this.tracks.set(command.trackId, this.createTrack(command))
        break
      case 'track/remove':
        this.order = null
        this.tracks.delete(command.trackId)
        break
      case 'track/setPatch':
        this.instrument(command.trackId)?.setPatch(command.patch)
        break
      case 'track/setFx':
        this.tracks.get(command.trackId)?.setFx(command.graph)
        this.order = null // which returns it sends to may have changed
        break
      case 'track/setNoteGraph':
        this.instrument(command.trackId)?.setNoteGraph(command.graph)
        this.order = null
        break
      case 'track/setVoices':
        this.instrument(command.trackId)?.setVoices(command.voices)
        break
      case 'track/setClips':
        this.instrument(command.trackId)?.setClips(command.clips)
        break
      case 'track/setAudioClips':
        this.audio(command.trackId)?.setClips(command.clips)
        break
      case 'track/setVolume': {
        const track = this.tracks.get(command.trackId)
        if (track) track.volume = command.volume
        break
      }
      case 'track/setParam':
        this.tracks.get(command.trackId)?.setParam(command.nodeId, command.paramId, command.value)
        break
      case 'track/setSample':
        this.tracks.get(command.trackId)?.setSample(command.nodeId, command.sampleId)
        break
      case 'sample/add':
        this.samples.set(command.sample)
        break
      case 'sample/remove':
        this.samples.delete(command.sampleId)
        break
      case 'sample/preview': {
        const sample = this.samples.get(command.sampleId)
        if (sample) this.preview.start(sample)
        break
      }
      case 'sample/stopPreview':
        this.preview.stop()
        break
      case 'track/audition':
        this.instrument(command.trackId)?.auditionNote(command.pitch, command.velocity)
        break
      case 'track/stop':
        this.tracks.get(command.trackId)?.stopClip()
        break
      case 'clip/launch':
        this.tracks.get(command.trackId)?.launchClip(command.clipId)
        this.transport.play()
        break
      case 'scene/launch':
        for (const track of this.tracks.values()) track.launchScene(command.scene)
        this.transport.play()
        break
    }
  }

  /** Fills `left`/`right` with audio, advancing the transport. Buffers may be any length. */
  render(left: Float32Array, right: Float32Array): void {
    left.fill(0)
    right.fill(0)
    for (let offset = 0; offset < left.length; offset += MAX_BLOCK_FRAMES) {
      const frames = Math.min(MAX_BLOCK_FRAMES, left.length - offset)
      this.renderBlock(left, right, offset, frames)
    }
    this.preview.mixInto(left, right)
    softClip(left)
    softClip(right)
    this.peak = Math.max(this.peak, peakOf(left), peakOf(right))
  }

  /** Snapshot for display. Reading it also resets the output-level peak. */
  status(): EngineStatus {
    const tracks: Record<string, LauncherStatus> = {}
    for (const [id, track] of this.tracks) tracks[id] = track.status()
    const peak = this.peak
    this.peak = 0 // each snapshot reports the level since the previous one
    return { playing: this.transport.playing, beat: this.transport.positionBeats, peak, tracks }
  }

  private stopTransport(): void {
    this.transport.stop()
    for (const track of this.tracks.values()) track.reset()
  }

  private renderBlock(left: Float32Array, right: Float32Array, offset: number, frames: number): void {
    const events = this.transport.playing ? this.collectEvents(frames) : []

    let cursor = 0
    for (const { frame, action } of events) {
      this.mixSegment(left, right, offset, cursor, frame - cursor)
      cursor = frame
      action.run()
    }
    this.mixSegment(left, right, offset, cursor, frames - cursor)
    this.transport.advance(frames)
  }

  private collectEvents(frames: number): ScheduledEvent[] {
    const from = this.transport.positionBeats
    const to = this.transport.beatAfter(frames)
    const scheduled: ScheduledEvent[] = []
    this.taps.clear()
    for (const track of this.runOrder()) {
      for (const action of track.schedule(from, to, this.taps)) {
        scheduled.push({ frame: this.transport.frameOf(action.beat, frames), action })
      }
    }
    // Array#sort is stable, so same-frame events keep each launcher's own order (offs before ons).
    return scheduled.sort((a, b) => a.frame - b.frame)
  }

  /**
   * Mixes `frames` samples starting `cursor` frames into the current block. Audio clips need to know where that
   * is on the beat clock to stay locked to the grid.
   */
  private mixSegment(
    left: Float32Array,
    right: Float32Array,
    blockOffset: number,
    cursor: number,
    frames: number,
  ): void {
    if (frames <= 0) return
    const timing = { beat: this.transport.beatAfter(cursor), beatsPerSample: this.transport.beatsPerSample }
    // Senders run before the return tracks they send to, so each return's input is complete when it is mixed.
    this.sends.clear(frames)
    for (const track of this.runOrder()) track.mixInto(left, right, blockOffset + cursor, frames, timing, this.sends)
  }

  /**
   * Tracks sorted so each runs after the tracks it takes notes from, and each return track after every track that sends
   * to it. Tracks that depend on each other in a loop (the editor prevents this) are put last and simply read nothing
   * from one another.
   */
  private runOrder(): readonly PlayableTrack[] {
    if (this.order) return this.order
    const needs = new Map<string, string[]>(
      [...this.tracks].map(([id, track]) => [id, track.tapSources().filter((source) => this.tracks.has(source))]),
    )
    for (const [id, track] of this.tracks) {
      for (const target of track.sendTargets()) if (target !== id) needs.get(target)?.push(id)
    }
    this.sends.sync([...this.tracks].filter(([, track]) => track instanceof ReturnTrackRuntime).map(([id]) => id))
    const done = new Set<string>()
    const order: PlayableTrack[] = []
    let progress = true
    while (progress) {
      progress = false
      for (const [id, track] of this.tracks) {
        if (done.has(id) || !(needs.get(id) ?? []).every((source) => done.has(source))) continue
        done.add(id)
        order.push(track)
        progress = true
      }
    }
    for (const [id, track] of this.tracks) if (!done.has(id)) order.push(track)
    this.order = order
    return order
  }

  private createTrack(command: Extract<EngineCommand, { type: 'track/add' }>): PlayableTrack {
    switch (command.kind) {
      case 'return':
        return new ReturnTrackRuntime(command.trackId, command.fx, command.volume, this.sampleRate, this.samples)
      case 'audio':
        return new AudioTrackRuntime(command.fx, command.clips, command.volume, this.samples, this.sampleRate)
      case 'instrument':
        return new TrackRuntime(
          command.trackId,
          command.patch,
          command.noteGraph,
          command.fx,
          command.clips,
          command.volume,
          command.voices,
          this.sampleRate,
          this.samples,
        )
    }
  }

  private instrument(trackId: string): TrackRuntime | undefined {
    const track = this.tracks.get(trackId)
    return track instanceof TrackRuntime ? track : undefined
  }

  private audio(trackId: string): AudioTrackRuntime | undefined {
    const track = this.tracks.get(trackId)
    return track instanceof AudioTrackRuntime ? track : undefined
  }
}

const softClip = (buffer: Float32Array): void => {
  for (let i = 0; i < buffer.length; i++) buffer[i] = Math.tanh(buffer[i] ?? 0)
}

const peakOf = (buffer: Float32Array): number => {
  let peak = 0
  for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i] ?? 0))
  return peak
}
