import { MAX_BLOCK_FRAMES } from '../instrument'
import { SampleBank } from '../sample'
import type { LauncherStatus } from '../session'
import { Transport } from '../transport'
import { AudioTrackRuntime } from './audio-track-runtime'
import type { EngineCommand } from './commands'
import type { PlayableTrack, ScheduledAction } from './playable-track'
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
          command.kind === 'audio'
            ? new AudioTrackRuntime(command.clips, command.volume, this.samples, this.sampleRate)
            : new TrackRuntime(
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
        this.instrument(command.trackId)?.setPatch(command.patch)
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
        this.instrument(command.trackId)?.setParam(command.nodeId, command.paramId, command.value)
        break
      case 'track/setSample':
        this.instrument(command.trackId)?.setSample(command.nodeId, command.sampleId)
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
    for (const track of this.tracks.values()) {
      for (const action of track.schedule(from, to)) {
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
    for (const track of this.tracks.values()) track.mixInto(left, right, blockOffset + cursor, frames, timing)
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
