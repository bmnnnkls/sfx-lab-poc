import { MAX_BLOCK_FRAMES } from '../instrument'
import { SampleBank } from '../sample'
import type { NoteEvent } from '../session'
import { Transport } from '../transport'
import type { EngineCommand } from './commands'
import { SamplePreview } from './sample-preview'
import type { EngineStatus } from './status'
import { TrackRuntime } from './track-runtime'

interface ScheduledEvent {
  readonly frame: number
  readonly track: TrackRuntime
  readonly event: NoteEvent
}

/**
 * The whole audio engine behind two calls: `apply(command)` to change it and
 * `render(left, right)` to pull audio. Has no browser dependencies, so it runs the
 * same in an AudioWorklet, in Node tests, or in an offline bounce.
 */
export class Engine {
  private readonly transport: Transport
  private readonly tracks = new Map<string, TrackRuntime>()
  private readonly samples = new SampleBank()
  private readonly preview: SamplePreview
  private peak = 0

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
        this.tracks.set(
          command.trackId,
          new TrackRuntime(
            command.patch,
            command.clips,
            command.volume,
            command.voices,
            this.sampleRate,
            this.samples,
          ),
        )
        break
      case 'track/remove':
        this.tracks.delete(command.trackId)
        break
      case 'track/setPatch':
        this.tracks.get(command.trackId)?.setPatch(command.patch)
        break
      case 'track/setVoices':
        this.tracks.get(command.trackId)?.setVoices(command.voices)
        break
      case 'track/setClips':
        this.tracks.get(command.trackId)?.setClips(command.clips)
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
      case 'track/stop':
        this.tracks.get(command.trackId)?.launcher.stop()
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
    const tracks: Record<string, ReturnType<TrackRuntime['launcher']['status']>> = {}
    for (const [id, track] of this.tracks) tracks[id] = track.launcher.status()
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
    for (const { frame, track, event } of events) {
      this.mixSegment(left, right, offset + cursor, frame - cursor)
      cursor = frame
      track.apply(event)
    }
    this.mixSegment(left, right, offset + cursor, frames - cursor)
    this.transport.advance(frames)
  }

  private collectEvents(frames: number): ScheduledEvent[] {
    const from = this.transport.positionBeats
    const to = this.transport.beatAfter(frames)
    const scheduled: ScheduledEvent[] = []
    for (const track of this.tracks.values()) {
      for (const event of track.launcher.collectEvents(from, to)) {
        scheduled.push({ frame: this.transport.frameOf(event.beat, frames), track, event })
      }
    }
    // Array#sort is stable, so same-frame events keep the launcher's off-before-on order.
    return scheduled.sort((a, b) => a.frame - b.frame)
  }

  private mixSegment(left: Float32Array, right: Float32Array, offset: number, frames: number): void {
    if (frames <= 0) return
    for (const track of this.tracks.values()) track.mixInto(left, right, offset, frames)
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
