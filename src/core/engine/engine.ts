import { RIGHT, STEREO_FRAMES } from '../dsp'
import { FxGraph, MAX_BLOCK_FRAMES } from '../instrument'
import type { TapBoard } from '../notefx'
import { createDefaultMasterGraph } from '../patch'
import { SampleBank } from '../sample'
import type { LauncherStatus } from '../session'
import { Transport } from '../transport'
import { AudioBoard } from './audio-board'
import { AudioTaps } from './audio-taps'
import { AudioTrackRuntime } from './audio-track-runtime'
import type { EngineCommand } from './commands'
import type { MixContext, PlayableTrack, ScheduledAction } from './playable-track'
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
  /** The master fader, applied after the master graph and before the soft clip. */
  private masterVolume = 1
  /** Mute, solo and sends need working out again (a mute or solo changed, or the tracks did). */
  private mixStateStale = false
  /**
   * Two orders, because notes and sound are passed on at different times: the order the tracks' events are scheduled in
   * (a track after the tracks it takes notes from) and the order they are mixed in (a return after the tracks that send
   * to it, a track after the tracks it takes audio from). Each is rebuilt when tracks or graphs change.
   */
  private scheduleOrder: PlayableTrack[] | null = null
  private mixOrder: PlayableTrack[] | null = null
  /** What each track's note graph produced in the current block, for other tracks to read. */
  private readonly noteTaps: TapBoard = new Map()
  /** What the tracks sent to each return track in the stretch being mixed. */
  private readonly sends = new AudioBoard()
  /** What the tracks sounded like in the stretch being mixed, for Track audio nodes. */
  private readonly audioTaps = new AudioTaps()
  /** The master bus's insert graph, on the mix of all tracks (a pass-through until the project sets one). */
  private master: FxGraph
  private readonly masterInput = new Float32Array(STEREO_FRAMES)

  constructor(private readonly sampleRate: number) {
    this.transport = new Transport(sampleRate)
    this.preview = new SamplePreview(sampleRate)
    this.master = new FxGraph(createDefaultMasterGraph(), sampleRate, this.samples)
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
        this.invalidateOrder()
        this.tracks.set(command.trackId, this.createTrack(command))
        break
      case 'track/remove':
        this.invalidateOrder()
        this.tracks.delete(command.trackId)
        break
      case 'track/setPatch':
        this.instrument(command.trackId)?.setPatch(command.patch)
        break
      case 'master/setFx':
        this.master = new FxGraph(command.graph, this.sampleRate, this.samples)
        break
      case 'master/setParam':
        this.master.setParam(command.nodeId, command.paramId, command.value)
        break
      case 'master/setSample':
        this.master.setSample(command.nodeId, command.sampleId)
        break
      case 'track/setFx':
        this.tracks.get(command.trackId)?.setFx(command.graph)
        this.invalidateOrder() // which returns it sends to may have changed
        break
      case 'track/setNoteGraph':
        this.instrument(command.trackId)?.setNoteGraph(command.graph)
        this.invalidateOrder()
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
        if (track) track.strip.volume = command.volume
        break
      }
      case 'track/setPan': {
        const track = this.tracks.get(command.trackId)
        if (track) track.strip.pan = command.pan
        break
      }
      case 'track/setMute': {
        const track = this.tracks.get(command.trackId)
        if (track) track.strip.muted = command.muted
        this.mixStateStale = true
        break
      }
      case 'track/setSolo': {
        const track = this.tracks.get(command.trackId)
        if (track) track.strip.soloed = command.soloed
        this.mixStateStale = true
        break
      }
      case 'master/setVolume':
        this.masterVolume = command.volume
        break
      case 'track/setSends':
        this.tracks.get(command.trackId)?.setSends(command.sends)
        this.invalidateOrder() // which returns it sends to may have changed
        break
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
      this.processMaster(left, right, offset, frames)
    }
    // A sample being auditioned is not part of the mix, so it skips the master graph.
    this.preview.mixInto(left, right)
    softClip(left)
    softClip(right)
    this.peak = Math.max(this.peak, peakOf(left), peakOf(right))
  }

  /** Snapshot for display. Reading it also resets the output-level peak. */
  status(): EngineStatus {
    const tracks: Record<string, LauncherStatus> = {}
    for (const [id, track] of this.tracks) tracks[id] = track.status()
    const peaks: Record<string, number> = {}
    for (const [id, track] of this.tracks) peaks[id] = track.strip.takePeak()
    const peak = this.peak
    this.peak = 0 // each snapshot reports the level since the previous one
    const readouts: Record<string, Readonly<Record<string, number>>> = {}
    for (const [id, track] of this.tracks) {
      const found = track.readouts()
      if (Object.keys(found).length > 0) readouts[id] = found
    }
    const masterReadouts = this.master.readouts()
    if (Object.keys(masterReadouts).length > 0) readouts.master = masterReadouts
    return { playing: this.transport.playing, beat: this.transport.positionBeats, peak, peaks, readouts, tracks }
  }

  private stopTransport(): void {
    this.transport.stop()
    for (const track of this.tracks.values()) track.reset()
  }

  /** Runs the mix of the block through the master graph and the master fader, in place. */
  private processMaster(left: Float32Array, right: Float32Array, offset: number, frames: number): void {
    const input = this.masterInput
    for (let i = 0; i < frames; i++) {
      input[i] = left[offset + i] ?? 0
      input[RIGHT + i] = right[offset + i] ?? 0
    }
    const output = this.master.process(input, frames)
    for (let i = 0; i < frames; i++) {
      left[offset + i] = (output[i] ?? 0) * this.masterVolume
      right[offset + i] = (output[RIGHT + i] ?? 0) * this.masterVolume
    }
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
    this.noteTaps.clear()
    for (const track of this.scheduleTracks()) {
      for (const action of track.schedule(from, to, this.noteTaps)) {
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
    const mix: MixContext = {
      timing: { beat: this.transport.beatAfter(cursor), beatsPerSample: this.transport.beatsPerSample },
      sends: this.sends,
      taps: this.audioTaps,
    }
    // Tracks come after the ones they take sound from, so what they read from the boards is complete.
    if (this.mixStateStale) this.updateMixState()
    this.sends.clear(frames)
    this.audioTaps.clear(frames)
    for (const track of this.mixTracks()) track.mixInto(left, right, blockOffset + cursor, frames, mix)
  }

  private invalidateOrder(): void {
    this.scheduleOrder = null
    this.mixOrder = null
    this.mixStateStale = true // which tracks feed which returns may have changed
  }

  /**
   * Works out, from every track's mute and solo, which tracks are heard and which sends are open (rules in
   * ARCHITECTURE.md, "Mixer"). Done when something changes, never per sample.
   */
  private updateMixState(): void {
    this.mixStateStale = false
    const entries = [...this.tracks]
    const soloActive = entries.some(([, track]) => track.strip.soloed)
    const returns = entries.filter(([, track]) => track instanceof ReturnTrackRuntime)
    for (const [, track] of entries) track.strip.audible = soloActive ? track.strip.soloed : !track.strip.muted

    // A send is open when its track is soloed, or is not muted and either heard or sending to a soloed return.
    const open = (from: PlayableTrack, to: PlayableTrack): boolean =>
      from.strip.soloed || (!from.strip.muted && (from.strip.audible || to.strip.soloed))

    if (soloActive) {
      // Returns fed by a heard track stay heard (so a soloed track keeps its reverb), however many returns deep.
      let grew = true
      while (grew) {
        grew = false
        for (const [, from] of entries) {
          if (!from.strip.audible) continue
          for (const targetId of from.sendTargets()) {
            const to = this.tracks.get(targetId)
            if (to instanceof ReturnTrackRuntime && !to.strip.audible && !to.strip.muted && open(from, to)) {
              to.strip.audible = true
              grew = true
            }
          }
        }
      }
    }
    for (const [id, from] of entries) {
      const blocked = returns.filter(([returnId, to]) => returnId !== id && !open(from, to)).map(([returnId]) => returnId)
      from.strip.blockedSends = new Set(blocked)
    }
  }

  /** The tracks in the order their events are scheduled in: each after the tracks it takes notes from. */
  private scheduleTracks(): readonly PlayableTrack[] {
    this.scheduleOrder ??= this.sorted(new Map([...this.tracks].map(([id, track]) => [id, track.tapSources()])))
    return this.scheduleOrder
  }

  /**
   * The tracks in the order they are mixed in: each return track after every track that sends to it, and each track
   * after the tracks it takes audio from. Also prepares the boards that carry that sound.
   */
  private mixTracks(): readonly PlayableTrack[] {
    if (this.mixOrder) return this.mixOrder
    const needs = new Map<string, string[]>([...this.tracks].map(([id, track]) => [id, [...track.audioSources()]]))
    for (const [id, track] of this.tracks) {
      for (const target of track.sendTargets()) if (target !== id) needs.get(target)?.push(id)
    }
    this.sends.sync([...this.tracks].filter(([, track]) => track instanceof ReturnTrackRuntime).map(([id]) => id))
    this.audioTaps.sync([...this.tracks.values()].flatMap((track) => track.audioSources()).filter((id) => this.tracks.has(id)))
    this.mixOrder = this.sorted(needs)
    return this.mixOrder
  }

  /**
   * The tracks sorted so each comes after those it `needs`. Tracks that need each other in a loop (the editor and
   * files prevent this) are put last and simply read nothing from one another.
   */
  private sorted(needs: ReadonlyMap<string, readonly string[]>): PlayableTrack[] {
    const done = new Set<string>()
    const order: PlayableTrack[] = []
    let progress = true
    while (progress) {
      progress = false
      for (const [id, track] of this.tracks) {
        if (done.has(id) || !(needs.get(id) ?? []).every((source) => done.has(source) || !this.tracks.has(source))) continue
        done.add(id)
        order.push(track)
        progress = true
      }
    }
    for (const [id, track] of this.tracks) if (!done.has(id)) order.push(track)
    return order
  }

  private createTrack(command: Extract<EngineCommand, { type: 'track/add' }>): PlayableTrack {
    const track = this.buildTrack(command)
    track.strip.pan = command.pan ?? 0
    track.strip.muted = command.muted ?? false
    track.strip.soloed = command.soloed ?? false
    return track
  }

  private buildTrack(command: Extract<EngineCommand, { type: 'track/add' }>): PlayableTrack {
    switch (command.kind) {
      case 'return':
        return new ReturnTrackRuntime(command.trackId, command.fx, command.volume, this.sampleRate, this.samples)
      case 'audio': {
        const track = new AudioTrackRuntime(command.trackId, command.fx, command.clips, command.volume, this.samples, this.sampleRate)
        track.setSends(command.sends ?? {})
        return track
      }
      case 'instrument': {
        const track = new TrackRuntime(
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
        track.setSends(command.sends ?? {})
        return track
      }
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
