import { controlOwnerId, controlTargetKey, flatControlNodeId, type ControlTarget } from '../control'
import { EngineAutomation } from './automation'
import { RIGHT, STEREO_FRAMES } from '../dsp'
import { FxGraph, MAX_BLOCK_FRAMES } from '../instrument'
import type { TapBoard } from '../notefx'
import { createDefaultMasterGraph } from '../patch'
import { SampleBank } from '../sample'
import type { LauncherStatus, NoteScope } from '../session'
import { Transport } from '../transport'
import { AudioBoard } from './audio-board'
import { AudioTaps } from './audio-taps'
import { AudioTrackRuntime } from './audio-track-runtime'
import type { EngineCommand } from './commands'
import { GroupBusRuntime } from './group-bus-runtime'
import { type MixChannel, mixState } from './mix-state'
import type { MixContext, PlayableTrack, ScheduledAction, PlaybackMode } from './playable-track'
import { ReturnTrackRuntime } from './return-track-runtime'
import { SamplePreview } from './sample-preview'
import type { EngineStatus } from './status'
import { clipSource, liveSource } from './live-notes'
import { TrackRuntime } from './track-runtime'

interface ScheduledEvent {
  readonly frame: number
  readonly order: number
  readonly action: ScheduledAction
}

/**
 * The whole audio engine behind two calls: `apply(command)` to change it and
 * `render(left, right)` to pull audio. Has no browser dependencies, so it runs the
 * same in an AudioWorklet, in Node tests, or in an offline bounce.
 */
export class Engine {
  private readonly automation = new EngineAutomation((target, value, baseValue) => this.writeAutomation(target, value, baseValue))
  private collecting: { frame: number; frames: number } | null = null
  /** Curves live until every audio subrun of their planning horizon has consumed them. */
  private targetMetadata = new WeakMap<ControlTarget, { key: string; nodeId: string }>()
  private readonly curves = new Map<string, { target: ControlTarget; values: Float64Array; baseValue: number; used: boolean }>()
  /** Reused per horizon; a queued launch may clear overrides before its earlier samples are mixed. */
  private readonly horizonEntryOverrides = new Map<string, number>()
  private readonly automationSends = new Map<string, Record<string, number>>()
  private readonly transport: Transport
  private readonly tracks = new Map<string, PlayableTrack>()
  private readonly samples = new SampleBank()
  private readonly preview: SamplePreview
  private peak = 0
  private noteBeat = 0
  /** The master fader, applied after the master graph and before the soft clip. */
  private masterVolume = 1
  private masterVolumeCurve: Float64Array | null = null
  /** Mute, solo and sends need working out again (a mute or solo changed, or the tracks did). */
  private mixStateStale = false
  /**
   * Two orders, because notes and sound are passed on at different times: the order the tracks' events are scheduled in
   * (a track after the tracks it takes notes from) and the order they are mixed in (a return after the tracks that send
   * to it, a track after the tracks it takes audio from). Each is rebuilt when tracks or graphs change.
   */
  private scheduleOrder: PlayableTrack[] | null = null
  private mixOrder: (readonly [string, PlayableTrack])[] | null = null
  private instrumentOrder: readonly TrackRuntime[] | null = null
  private noteComponents: readonly { tracks: readonly TrackRuntime[]; ids: readonly string[] }[] | null = null
  private readonly noteOwners = new Set<string>()
  private readonly sampleTracks: TrackRuntime[] = []
  private readonly intervalTracks: TrackRuntime[] = []
  private readonly scheduleRanks = new Map<PlayableTrack, number>()
  /** What each track's note graph produced in the current block, for other tracks to read. */
  private readonly noteTaps: TapBoard = new Map()
  /** What the tracks sent to each return track in the stretch being mixed. */
  private readonly sends = new AudioBoard()
  /** Where members of a group bus leave their output, one slot per bus. */
  private readonly outputs = new AudioBoard()
  /** The bus each channel sums into; absent = the master. */
  private readonly routes = new Map<string, string>()
  /** What the tracks sounded like in the stretch being mixed, for Track audio nodes. */
  private readonly audioTaps = new AudioTaps()
  /** The master bus's insert graph, on the mix of all tracks (a pass-through until the project sets one). */
  private master: FxGraph
  private readonly masterInput = new Float32Array(STEREO_FRAMES)
  /** Which event source the tracks follow: the session launchers or the arrangement timeline. */
  private playbackMode: PlaybackMode = 'session'
  /** The last loop jump in the current `render` call: the frame it fell on and the beat it went to. */
  private jump: { readonly frame: number; readonly beat: number } | null = null

  constructor(private readonly sampleRate: number) {
    this.transport = new Transport(sampleRate)
    this.preview = new SamplePreview(sampleRate)
    this.master = new FxGraph(createDefaultMasterGraph(), sampleRate, this.samples)
  }

  /** Compile topology and empty routing boards without rendering, scheduling or advancing a clock.
   * The host can do this while suspended; subsequent topology edits retain normal invalidation.
   */
  prepareTopology(): void {
    this.noteTracks()
    this.components()
    this.mixTracks()
    if (this.mixStateStale) this.updateMixState()
  }

  apply(command: EngineCommand): void {
    switch (command.type) {
      case 'automation/launch':
        this.automation.launchSlot(command.owner, command.slotId)
        this.transport.play()
        break
      case 'automation/configure':
        this.curves.clear()
        this.targetMetadata = new WeakMap()
        this.automation.configure(command.tracks, new Map([...this.tracks].map(([id, track]) => [id, track.status()])))
        for (const [id, track] of this.tracks) if (track instanceof TrackRuntime) track.setAutomationNoteGraph(command.tracks.find((t) => t.trackId === id)?.noteGraph)
        break
      case 'automation/overrides': this.automation.setOverrides(command.values, command.revision); break
      case 'track/noteOn':
        this.instrument(command.trackId)?.noteOn(command.note, command.pitch, command.velocity)
        break
      case 'track/noteOff':
        this.instrument(command.trackId)?.noteOff(command.note)
        break
      case 'notes/sustain':
        for (const track of this.tracks.values()) if (track instanceof TrackRuntime) track.sustain(command.sourceId, command.channel, command.down)
        break
      case 'notes/releaseSource':
        this.cancelNotes({ source: liveSource(command.sourceId), ...(command.channel === undefined ? {} : { channel: command.channel }) })
        break
      case 'notes/panic':
        this.cancelNotes()
        break
      case 'transport/play':
        this.playSession()
        break
      case 'transport/stop':
        this.stopTransport()
        break
      case 'transport/setTempo':
        this.transport.setTempo(command.bpm)
        // The nodes follow the tempo too (a Clock counting beats), so every graph is told, the master's included.
        for (const track of this.tracks.values()) track.setTempo(command.bpm)
        this.master.setTempo(command.bpm)
        break
      case 'arrangement/set':
        for (const track of this.tracks.values()) track.setArrangement(command.clips)
        break
      case 'arrangement/play':
        // A seek while the arrangement plays releases what was sounding, as the loop's jump does.
        if (this.playbackMode === 'arrangement' && this.transport.playing) {
          this.seekArrangement(command.fromBeat ?? 0)
          break
        }
        this.playbackMode = 'arrangement'
        this.transport.seek(command.fromBeat ?? 0)
        this.transport.play()
        for (const track of this.tracks.values()) track.setMode('arrangement')
        break
      case 'arrangement/stop':
        this.stopTransport()
        break
      case 'arrangement/setLoop':
        this.transport.loop = command.loop
        break
      case 'track/add':
        if (this.tracks.has(command.trackId)) this.cancelTrackNotes(command.trackId)
        this.invalidateOrder()
        this.tracks.set(command.trackId, this.createTrack(command))
        this.setRoute(command.trackId, command.output ?? null)
        // A track added mid-arrangement follows the timeline like the rest.
        if (this.playbackMode === 'arrangement') this.tracks.get(command.trackId)?.setMode('arrangement')
        break
      case 'track/remove':
        // A removed track may have generated notes in downstream readers. Cancel those graphs too.
        this.cancelTrackNotes(command.trackId)
        this.invalidateOrder()
        this.tracks.delete(command.trackId)
        this.routes.delete(command.trackId)
        break
      case 'track/setOutput':
        this.setRoute(command.trackId, command.output)
        this.invalidateOrder()
        break
      case 'track/setPatch':
        this.cancelTrackNotes(command.trackId)
        this.instrument(command.trackId)?.setPatch(command.patch)
        break
      case 'master/setFx':
        this.master = new FxGraph(command.graph, this.sampleRate, this.samples, this.transport.tempo)
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
        if (this.instrument(command.trackId)?.setNoteGraph(command.graph)) {
          this.cancelTrackNotes(command.trackId)
          this.invalidateOrder()
        }
        break
      case 'track/setVoices':
        this.cancelTrackNotes(command.trackId)
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
        this.automationSends.set(command.trackId, { ...command.sends })
        this.setSendLevels(command.trackId, command.sends)
        break
      case 'track/setParam':
        this.tracks.get(command.trackId)?.setParam(command.nodeId, command.paramId, command.value, command.graph)
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
      case 'sample/setLoop':
        this.samples.setLoop(command.sampleId, command.loop)
        break
      case 'sample/preview': {
        const sample = this.samples.get(command.sampleId)
        if (sample) this.preview.start(sample, command)
        break
      }
      case 'sample/stopPreview':
        this.preview.stop()
        break
      case 'track/audition':
        this.instrument(command.trackId)?.auditionNote(command.pitch, command.velocity)
        break
      case 'track/stop':
        this.automation.stopTrack(command.trackId)
        this.tracks.get(command.trackId)?.stopClip()
        break
      case 'clip/launch':
        this.automation.launch(command.trackId, command.clipId)
        this.tracks.get(command.trackId)?.launchClip(command.clipId)
        this.playSession()
        break
      case 'scene/launch':
        this.automation.scene(command.scene, command.trackIds)
        for (const [id, track] of this.tracks) if (!command.trackIds || command.trackIds.includes(id)) track.launchScene(command.scene)
        this.playSession()
        break
    }
  }

  /** Fills `left`/`right` with audio, advancing the transport. Buffers may be any length. */
  render(left: Float32Array, right: Float32Array): void {
    left.fill(0)
    right.fill(0)
    this.jump = null
    for (let offset = 0; offset < left.length;) {
      // Note-graph automation schedules at sample boundaries; audio and mixer curves keep block processing.
      let frames = Math.min(MAX_BLOCK_FRAMES, left.length - offset)
      // A block never crosses the loop's end: it stops on the last sample before it, and the position jumps back.
      const toLoopEnd = this.playbackMode === 'arrangement' && this.transport.playing ? this.transport.framesToLoopEnd() : null
      if (toLoopEnd !== null) frames = Math.min(frames, toLoopEnd)
      this.renderBlock(left, right, offset, frames)
      offset += frames
      const beat = toLoopEnd === null ? null : this.transport.loopJump()
      if (beat !== null) {
        this.seekArrangement(beat, this.transport.loop!.from)
        this.jump = { frame: offset, beat }
      }
    }
    // A sample being auditioned is not part of the mix, so it skips the master graph.
    this.preview.mixInto(left, right)
    softClip(left)
    softClip(right)
    this.peak = Math.max(this.peak, peakOf(left), peakOf(right))
  }

  /** The last loop jump of the latest `render` call, `frame` samples into it, or null; the recording clock anchors on it. */
  lastJump(): { readonly frame: number; readonly beat: number } | null {
    return this.jump
  }

  /** Clock-only snapshot: no readout traversal, peak reset or audio-state mutation. */
  clock(): Pick<EngineStatus, 'tempo' | 'playing' | 'beat'> {
    return { tempo: this.transport.tempo, playing: this.transport.playing, beat: this.transport.positionBeats }
  }

  /** Snapshot for display. Reading it also resets the output-level peak. */
  status(): EngineStatus {
    const tracks: Record<string, LauncherStatus> = {}
    for (const [id, track] of this.tracks) tracks[id] = this.automation.slotStatus({ kind: 'track', trackId: id }) ?? track.status()
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
    const preview = this.preview.position()
    return { tempo: this.transport.tempo, masterAutomation: this.automation.slotStatus({ kind: 'master' }), automationOverrides: this.automation.overrideValues(), automationOverrideRevision: this.automation.overrideRevision, automation: this.automation.readouts(), playing: this.transport.playing, mode: this.playbackMode, beat: this.transport.positionBeats, peak, peaks, readouts, tracks, ...(preview && { preview }) }
  }

  /** Structural edits cancel the affected track and every transitive note reader, without touching unrelated tracks. */
  private cancelTrackNotes(trackId: string): void {
    const affected = new Set([trackId])
    let grew = true
    while (grew) {
      grew = false
      for (const [id, track] of this.tracks) {
        if (!affected.has(id) && track.tapSources().some((source) => affected.has(source))) {
          affected.add(id)
          grew = true
        }
      }
    }
    for (const id of affected) this.instrument(id)?.cancelNotes()
  }

  private cancelNotes(scope?: NoteScope): void {
    for (const track of this.tracks.values()) if (track instanceof TrackRuntime) track.cancelNotes(scope)
  }

  /**
   * Moves the playing arrangement to `beat` (events from `eventsFrom`, after a loop jump): the timeline's held notes are
   * released there, so their tails start at the jump, and audio regions fade out in 5 ms and restart in phase under
   * the new position. Live notes keep sounding.
   */
  private seekArrangement(beat: number, eventsFrom?: number): void {
    this.transport.seek(beat, eventsFrom)
    // A track's notes may come from another track's timeline through a tap: release every source it can hear.
    for (const { tracks, ids } of this.components()) for (const track of tracks) for (const id of ids) track.cancelNotes({ source: clipSource(id) })
    for (const track of this.tracks.values()) if (track instanceof AudioTrackRuntime) track.seekArrangement()
  }

  private stopTransport(): void {
    this.automation.reset()
    this.transport.stop()
    for (const track of this.tracks.values()) track.reset()
  }

  /** Plays with the session launchers as the event source (switching back from the arrangement if needed). */
  private playSession(): void {
    if (this.playbackMode !== 'session') {
      this.playbackMode = 'session'
      for (const track of this.tracks.values()) track.setMode('session')
    }
    this.transport.play()
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
      left[offset + i] = (output[i] ?? 0) * (this.masterVolumeCurve?.[i] ?? this.masterVolume)
      right[offset + i] = (output[RIGHT + i] ?? 0) * (this.masterVolumeCurve?.[i] ?? this.masterVolume)
    }
  }

  private renderBlock(left: Float32Array, right: Float32Array, offset: number, frames: number): void {
    const audioEvents: ScheduledEvent[] = []
    if (this.transport.playing) for (const track of this.scheduleTracks()) if (!(track instanceof TrackRuntime)) {
      for (const action of track.schedule(this.transport.eventsFrom(0), this.transport.eventsTo(frames), this.noteTaps)) {
        audioEvents.push({ frame: this.eventFrame(action.beat, this.transport.positionBeats, frames), order: this.scheduleRanks.get(track)!, action })
      }
    }
    audioEvents.sort((a, b) => a.frame - b.frame)
    const instruments = this.noteTracks()
    if (!this.automation.configured && !instruments.some(track => track.hasNoteControls)) {
      // No ownership/curves/helper clock needs a planning horizon. Retain the established interval path,
      // including audio clip actions and generators, without paying automation's bookkeeping per block.
      const events = audioEvents
      this.collectEvents(0, frames, events, instruments)
      events.sort((a, b) => a.frame - b.frame || a.order - b.order)
      let cursor = 0
      for (const { frame, action } of events) {
        this.mixSegment(left, right, offset, cursor, frame - cursor)
        cursor = frame
        action.run()
      }
      this.mixSegment(left, right, offset, cursor, frames - cursor)
      this.transport.advance(frames)
      this.noteBeat += frames * this.transport.beatsPerSample
      return
    }
    let cursor = 0, audioIndex = 0
    while (cursor < frames) {
      // Apply starts/stops before discovering the new state's one-shot horizon.
      while (audioIndex < audioEvents.length && audioEvents[audioIndex]!.frame === cursor) audioEvents[audioIndex++]!.action.run()
      let end = audioEvents[audioIndex]?.frame ?? frames
      for (const [id, track] of this.tracks) if (track instanceof AudioTrackRuntime) {
        const remaining = track.framesUntilEnd({ beat: this.transport.beatAfter(cursor), beatsPerSample: this.transport.beatsPerSample })
        if (remaining === 0) { track.finishClip(this.transport.beatAfter(cursor)); this.automation.finish(id) }
        else end = Math.min(end, cursor + remaining)
      }
      // A zero-length lifecycle was committed above; every planned horizon must now advance.
      if (end <= cursor) throw new Error('Non-progressing audio planning horizon')
      for (const curve of this.curves.values()) curve.used = false
      this.automation.copyOverrides(this.horizonEntryOverrides)
      const collecting = { frame: 0, frames: end - cursor }
      this.collecting = collecting
      const events: ScheduledEvent[] = []
      // Commit first-sample ownership and note values before any interval scheduling. A constant-range
      // proof may then retain the established processor without observing a later sample's parameters.
      if (this.transport.playing && this.automation.configured) this.automation.tick(this.transport.beatAfter(cursor), this.transport.beatAfter(cursor + 1))
      this.planNoteComponents(this.transport.beatAfter(cursor), this.transport.beatAfter(end))
      // Disconnected components cannot read each other's taps. Fixed-parameter components retain their
      // established interval processors (including autonomous generators); affected components keep sample cadence.
      this.collectEvents(cursor, end - cursor, events, this.intervalTracks)
      if (this.sampleTracks.length) {
        for (let frame = cursor; frame < end; frame++) {
          collecting.frame = frame - cursor
          if (frame > cursor && this.transport.playing && this.automation.configured) this.automation.tick(this.transport.beatAfter(frame), this.transport.beatAfter(frame + 1))
          this.collectEvents(frame, 1, events, this.sampleTracks)
        }
      } else if (this.transport.playing && this.automation.configured) {
        for (let frame = cursor + 1; frame < end; frame++) {
          collecting.frame = frame - cursor
          this.automation.tick(this.transport.beatAfter(frame), this.transport.beatAfter(frame + 1))
        }
      }
      this.collecting = null
      this.horizonEntryOverrides.clear()
      for (const curve of this.curves.values()) if (curve.used) {
        let last = curve.baseValue
        for (let i = 0; i < collecting.frames; i++) { if (Number.isNaN(curve.values[i]!)) curve.values[i] = last; else last = curve.values[i]! }
      }
      events.sort((a, b) => a.frame - b.frame || a.order - b.order)
      let mixed = cursor
      for (const { frame, action } of events) {
        this.mixSegment(left, right, offset, mixed, frame - mixed, mixed - cursor)
        mixed = frame
        action.run()
      }
      this.mixSegment(left, right, offset, mixed, end - mixed, mixed - cursor)
      cursor = end
    }
    this.transport.advance(frames)
    this.noteBeat += frames * this.transport.beatsPerSample
  }

  private eventFrame(beat: number, from: number, frames: number): number {
    return Math.max(0, Math.min(frames - 1, Math.round((beat - from) / this.transport.beatsPerSample)))
  }

  private collectEvents(cursor: number, frames: number, scheduled: ScheduledEvent[], tracks: readonly TrackRuntime[]): void {
    const from = this.noteBeat + cursor * this.transport.beatsPerSample
    const to = from + frames * this.transport.beatsPerSample
    this.noteTaps.clear()
    for (const track of tracks) {
      const actions = track.schedule(from, to, this.noteTaps, this.transport.playing ? this.transport.eventsFrom(cursor) : undefined, this.transport.eventsTo(cursor + frames))
      for (const action of actions) scheduled.push({ frame: cursor + this.eventFrame(action.beat, from, frames), order: this.scheduleRanks.get(track)!, action })
    }
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
    curveOffset = 0,
  ): void {
    if (frames <= 0) return
    this.master.clearAutomation()
    this.masterVolumeCurve = null
    for (const track of this.tracks.values()) { track.clearAutomation(); track.strip.clearAutomation() }
    for (const curve of this.curves.values()) if (curve.used) {
      const { target } = curve
      const values = curve.values.subarray(curveOffset, curveOffset + frames)
      if (target.owner.kind === 'master') {
        if (target.kind === 'graph') this.master.setAutomationCurve(flatControlNodeId(target), target.paramId, values)
        else { this.masterVolumeCurve = values; this.masterVolume = values[frames - 1]! }
        continue
      }
      // A group owner is its bus's channel, keyed by the group's id.
      const ownerId = controlOwnerId(target.owner)!
      const track = this.tracks.get(ownerId)
      if (!track) continue
      if (target.kind === 'graph') track.setAutomationCurve(flatControlNodeId(target), target.paramId, values, target.domain)
      else if (target.control === 'volume') { track.strip.volumeCurve = values; track.strip.volume = values[frames - 1]! }
      else if (target.control === 'pan') { track.strip.panCurve = values; track.strip.pan = values[frames - 1]! }
      else {
        track.strip.sendCurves.set(target.returnId, values)
        const sends = this.automationSends.get(ownerId) ?? {}
        sends[target.returnId] = values[frames - 1]!
        this.automationSends.set(ownerId, sends)
        this.setSendLevels(ownerId, sends)
      }
    }
    const mix: MixContext = {
      timing: { beat: this.transport.beatAfter(cursor), beatsPerSample: this.transport.beatsPerSample },
      sends: this.sends,
      outputs: this.outputs,
      taps: this.audioTaps,
    }
    // Tracks come after the ones they take sound from, so what they read from the boards is complete.
    if (this.mixStateStale) this.updateMixState()
    this.sends.clear(frames)
    this.outputs.clear(frames)
    this.audioTaps.clear(frames)
    for (const [id, track] of this.mixTracks()) {
      // A member of a bus adds to the bus's slot, at its start; everything else to the master, at the stretch.
      const bus = this.outputs.channels(this.routes.get(id) ?? '')
      if (bus) track.mixInto(bus.left, bus.right, 0, frames, mix)
      else track.mixInto(left, right, blockOffset + cursor, frames, mix)
    }
    this.processMaster(left, right, blockOffset + cursor, frames)
    for (const [id, track] of this.tracks) if (track instanceof AudioTrackRuntime && !track.status().playingClipId) this.automation.finish(id)
  }

  /** Zero-valued destinations remain members: a curve may cross zero inside the next block. */
  private setSendLevels(trackId: string, sends: Readonly<Record<string, number>>): void {
    const track = this.tracks.get(trackId)
    if (!track) return
    const previous = track.sendTargets()
    track.setSends(sends)
    const next = track.sendTargets()
    if (previous.length !== next.length || previous.some(id => !next.includes(id))) this.invalidateOrder()
  }

  private invalidateOrder(): void {
    this.scheduleOrder = null
    this.noteComponents = null
    this.instrumentOrder = null
    this.mixOrder = null
    this.mixStateStale = true // which tracks feed which returns may have changed
  }

  /** A channel's bus, or null for the master. */
  private setRoute(trackId: string, output: string | null): void {
    if (output === null) this.routes.delete(trackId)
    else this.routes.set(trackId, output)
  }

  /**
   * Works out, from every channel's mute and solo (the effective flags, through its groups), which channels are heard
   * and which sends are open (`mixState`, rules in docs/architecture/mixing-and-routing.md, "Mixer"). Done when something changes, never per
   * sample.
   */
  private updateMixState(): void {
    this.mixStateStale = false
    const channels: MixChannel[] = [...this.tracks].map(([id, track]) => ({
      id,
      kind: track instanceof ReturnTrackRuntime ? 'return' : track instanceof GroupBusRuntime ? 'bus' : 'track',
      muted: track.strip.muted,
      soloed: track.strip.soloed,
      output: this.routes.get(id) ?? null,
      sends: track.sendTargets(),
    }))
    const { heard, blocked } = mixState(channels)
    for (const [id, track] of this.tracks) {
      track.strip.audible = heard.has(id)
      track.strip.blockedSends = blocked.get(id)!
    }
  }

  private noteTracks(): readonly TrackRuntime[] {
    return this.instrumentOrder ??= this.scheduleTracks().filter((track): track is TrackRuntime => track instanceof TrackRuntime)
  }

  /** Topology-only compilation: an undirected closure includes every upstream source and transitive reader. */
  private components(): readonly { tracks: readonly TrackRuntime[]; ids: readonly string[] }[] {
    if (this.noteComponents) return this.noteComponents
    const ordered = this.noteTracks()
    const ids = new Map([...this.tracks].map(([id, track]) => [track, id]))
    const neighbors = new Map(ordered.map(track => [track, new Set<TrackRuntime>()]))
    for (const track of ordered) for (const id of track.tapSources()) {
      const source = this.tracks.get(id)
      if (!(source instanceof TrackRuntime)) continue
      neighbors.get(track)!.add(source)
      neighbors.get(source)!.add(track)
    }
    const seen = new Set<TrackRuntime>()
    const components: { tracks: TrackRuntime[]; ids: string[] }[] = []
    for (const root of ordered) {
      if (seen.has(root)) continue
      const members = new Set<TrackRuntime>(), pending = [root]
      while (pending.length) {
        const track = pending.pop()!
        if (members.has(track)) continue
        members.add(track); seen.add(track)
        for (const neighbor of neighbors.get(track)!) pending.push(neighbor)
      }
      const tracks = ordered.filter(track => members.has(track))
      components.push({ tracks, ids: tracks.map(track => ids.get(track)!) })
    }
    return this.noteComponents = components
  }

  private planNoteComponents(from: number, to: number): void {
    this.noteOwners.clear()
    if (this.transport.playing) this.automation.noteOwners(this.noteOwners, from, to)
    this.sampleTracks.length = 0
    this.intervalTracks.length = 0
    for (const component of this.components()) {
      const sample = component.ids.some(id => this.noteOwners.has(id)) || component.tracks.some(track => track.hasNoteControls)
      const into = sample ? this.sampleTracks : this.intervalTracks
      into.push(...component.tracks)
    }
  }

  /** The tracks in the order their events are scheduled in: each after the tracks it takes notes from. */
  private scheduleTracks(): readonly PlayableTrack[] {
    if (!this.scheduleOrder) {
      this.scheduleOrder = this.sorted(new Map([...this.tracks].map(([id, track]) => [id, track.tapSources()])))
      this.scheduleRanks.clear()
      this.scheduleOrder.forEach((track, index) => this.scheduleRanks.set(track, index))
    }
    return this.scheduleOrder
  }

  /**
   * The tracks in the order they are mixed in: each return track after every track that sends to it, each bus after
   * the channels that sum into it, and each track after the tracks it takes audio from. Also prepares the boards that
   * carry that sound.
   */
  private mixTracks(): readonly (readonly [string, PlayableTrack])[] {
    if (this.mixOrder) return this.mixOrder
    const needs = new Map<string, string[]>([...this.tracks].map(([id, track]) => [id, [...track.audioSources()]]))
    for (const [id, track] of this.tracks) {
      for (const target of track.sendTargets()) if (target !== id) needs.get(target)?.push(id)
    }
    for (const [id, bus] of this.routes) needs.get(bus)?.push(id)
    this.sends.sync([...this.tracks].filter(([, track]) => track instanceof ReturnTrackRuntime).map(([id]) => id))
    this.outputs.sync([...this.tracks].filter(([, track]) => track instanceof GroupBusRuntime).map(([id]) => id))
    this.audioTaps.sync([...this.tracks.values()].flatMap((track) => track.audioSources()).filter((id) => this.tracks.has(id)))
    const ids = new Map([...this.tracks].map(([id, track]) => [track, id]))
    this.mixOrder = this.sorted(needs).map((track) => [ids.get(track)!, track] as const)
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
    if (command.kind !== 'return') this.automationSends.set(command.trackId, { ...command.sends })
    track.strip.pan = command.pan ?? 0
    track.strip.muted = command.muted ?? false
    track.strip.soloed = command.soloed ?? false
    // A track added after the tempo was set starts with it, not with 120.
    track.setTempo(this.transport.tempo)
    return track
  }

  private buildTrack(command: Extract<EngineCommand, { type: 'track/add' }>): PlayableTrack {
    switch (command.kind) {
      case 'return':
        return new ReturnTrackRuntime(command.trackId, command.fx, command.volume, this.sampleRate, this.samples)
      case 'group': {
        const bus = new GroupBusRuntime(command.trackId, command.fx, command.volume, this.sampleRate, this.samples)
        bus.setSends(command.sends ?? {})
        return bus
      }
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

  private writeAutomation(target: ControlTarget, value: number, baseValue = value): void {
    let metadata = this.targetMetadata.get(target)
    if (!metadata) {
      metadata = { key: controlTargetKey(target), nodeId: target.kind === 'graph' ? flatControlNodeId(target) : '' }
      this.targetMetadata.set(target, metadata)
    }
    if (this.collecting && !(target.kind === 'graph' && target.domain === 'notes')) {
      const key = metadata.key
      let curve = this.curves.get(key)
      if (!curve) {
        curve = { target, values: new Float64Array(MAX_BLOCK_FRAMES), baseValue, used: false }
        this.curves.set(key, curve)
      }
      if (!curve.used) {
        curve.values.fill(NaN)
        curve.baseValue = this.horizonEntryOverrides.get(key) ?? baseValue
        curve.used = true
      }
      curve.values[this.collecting.frame] = value
      return
    }
    if (target.owner.kind === 'master') {
      if (target.kind === 'graph') this.master.setParam(metadata.nodeId, target.paramId, value)
      else this.masterVolume = value
      return
    }
    const ownerId = controlOwnerId(target.owner)!
    const track = this.tracks.get(ownerId)
    if (!track) return
    if (target.kind === 'graph') {
      const nodeId = metadata.nodeId
      if (track.setAutomationParam) track.setAutomationParam(nodeId, target.paramId, value, target.domain)
      else track.setParam(nodeId, target.paramId, value, target.domain)
    } else if (target.control === 'volume') track.strip.volume = value
    else if (target.control === 'pan') track.strip.pan = value
    else {
      const sends = this.automationSends.get(ownerId) ?? {}
      sends[target.returnId] = value
      this.automationSends.set(ownerId, sends)
      this.setSendLevels(ownerId, sends)
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
