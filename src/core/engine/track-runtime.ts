import { NoteControlGraph } from '../instrument'
import { DEFAULT_TEMPO, type TrackExpression } from '../dsp'
import { BEND_RANGE, type ExpressionControl, clampBendRange, createTrackExpression, expressionKey, expressionRange, restTrackExpression } from '../midi'
import { FxGraph, Instrument } from '../instrument'
import { NoteGraph, type TapBoard } from '../notefx'
import { type Patch, audioSources, sendTargets, setNodeParam } from '../patch'
import type { ArrangementClip, Clip, SendLevels } from '../project'
import type { SampleLookup } from '../sample'
import { ClipLauncher, type LauncherStatus, type NoteEvent, type NoteScope } from '../session'
import { ArrangementNotes } from './arrangement-player'
import type { PlaybackMode } from './playable-track'
import { LiveNotes, clipSource, type LiveNoteAddress } from './live-notes'
import { ChannelStrip } from './channel-strip'
import type { MixContext, PlayableTrack, ScheduledAction } from './playable-track'

/** How long an audition note sounds before it is released. */
const AUDITION_SECONDS = 0.3
const EMPTY_EVENTS: NoteEvent[] = []

/** Live, audio-thread counterpart of a project Track: voice + clip player + level. */
export class TrackRuntime implements PlayableTrack {
  private readonly launcher: ClipLauncher
  private readonly arrangement: ArrangementNotes
  private mode: PlaybackMode = 'session'
  private readonly live = new LiveNotes()
  private cancellations: (NoteScope | undefined)[] = []
  private readonly graph = new NoteGraph()
  private noteControls?: NoteControlGraph
  readonly strip: ChannelStrip
  clips: readonly (Clip | null)[]
  private instrument: Instrument
  private fx: FxGraph
  private targets: string[]
  private sources: string[]
  /** The send knobs as pairs of (return track id, level), post-fader. */
  private sendList: ReadonlyArray<readonly [string, number]> = []
  private audition: { pitch: number; framesLeft: number } | null = null
  /** Kept here as well, since the instrument and the insert graph are rebuilt by edits and must start with it. */
  private tempo = DEFAULT_TEMPO
  /**
   * The keyboard's wheel, pressure and CCs on this track, handed to every instrument built for it, so a patch edit keeps
   * them. Each control remembers the source and channel that set it last, so a source's release puts back only its own.
   */
  private readonly expression: TrackExpression
  private readonly expressionWriters = new Map<string, { readonly sourceId: string; readonly channel: number }>()
  private beatOrigin = 0
  private readonly tap = { clip: EMPTY_EVENTS, out: EMPTY_EVENTS }

  constructor(
    private readonly trackId: string,
    private patch: Patch,
    noteGraph: Patch,
    fx: Patch,
    clips: readonly (Clip | null)[],
    volume: number,
    private voices: number,
    private readonly sampleRate: number,
    private readonly samples: SampleLookup,
    bendRange: number = BEND_RANGE.default,
  ) {
    this.launcher = new ClipLauncher(4, clipSource(trackId))
    this.arrangement = new ArrangementNotes(clipSource(trackId))
    this.expression = createTrackExpression(bendRange)
    this.instrument = new Instrument(patch, sampleRate, voices, samples, DEFAULT_TEMPO, this.expression)
    this.fx = new FxGraph(fx, sampleRate, samples)
    this.targets = sendTargets(fx)
    this.sources = audioSources(fx)
    this.clips = clips
    this.strip = new ChannelStrip(volume)
    this.graph.sync(noteGraph)
  }

  /** Replaces the note graph. Knob changes keep running state; structural changes restart it. */
  setNoteGraph(graph: Patch): boolean {
    return this.graph.sync(graph)
  }

  noteOn(note: LiveNoteAddress, pitch: number, velocity: number): void { this.live.noteOn(note, pitch, velocity) }
  noteOff(note: LiveNoteAddress): void { this.live.noteOff(note) }
  sustain(sourceId: string, channel: number, down: boolean): void { this.live.sustain(sourceId, channel, down) }

  /** Sets one of the keyboard's controls from the next block on, clamped to its range. */
  express(sourceId: string, channel: number, control: ExpressionControl, value: number): void {
    if (!Number.isFinite(value)) return
    const { min, max } = expressionRange(control)
    const clamped = Math.min(max, Math.max(min, value))
    if (control === 'pitchBend') this.expression.bend = clamped
    else if (control === 'pressure') this.expression.pressure = clamped
    else this.expression.cc[control.cc] = clamped
    this.expressionWriters.set(expressionKey(control), { sourceId, channel })
  }

  /** Puts back at rest what `sourceId` (on `channel`, or any) set last, or everything without a source. */
  restExpression(sourceId?: string, channel?: number): void {
    if (sourceId === undefined) {
      restTrackExpression(this.expression)
      this.expressionWriters.clear()
      return
    }
    for (const [key, writer] of this.expressionWriters) {
      if (writer.sourceId !== sourceId || (channel !== undefined && writer.channel !== channel)) continue
      this.expressionWriters.delete(key)
      if (key === 'pitchBend') this.expression.bend = 0
      else if (key === 'pressure') this.expression.pressure = 0
      else this.expression.cc[Number(key.slice(3))] = 0
    }
  }

  setBendRange(range: number): void {
    this.expression.bendRange = clampBendRange(range)
  }

  /** What the keyboard is doing to this track now (tests, readouts). */
  expressionNow(): Readonly<TrackExpression> {
    return this.expression
  }

  /** Cancel ownership even when the graph has no connected source/sink. */
  cancelNotes(scope?: NoteScope): void {
    this.live.clear(scope)
    this.graph.cancel(scope)
    this.cancellations.push(scope)
    this.instrument.allNotesOff(scope)
    if (!scope) this.audition = null
  }

  setTempo(bpm: number): void {
    this.tempo = bpm
    this.instrument.setTempo(bpm)
    this.fx.setTempo(bpm)
  }

  setFx(fx: Patch): void {
    this.fx = new FxGraph(fx, this.sampleRate, this.samples, this.tempo)
    this.targets = sendTargets(fx)
    this.sources = audioSources(fx)
  }

  setSends(sends: SendLevels): void {
    this.sendList = Object.entries(sends)
  }

  audioSources(): string[] {
    return this.sources
  }

  sendTargets(): string[] {
    return [...new Set([...this.targets, ...this.sendList.map(([id]) => id)])]
  }

  tapSources(): string[] {
    return this.graph.tapSources()
  }

  setPatch(patch: Patch): void {
    this.audition = null
    this.patch = patch
    this.instrument = new Instrument(patch, this.sampleRate, this.voices, this.samples, this.tempo, this.expression)
  }

  setVoices(voices: number): void {
    this.audition = null
    this.voices = voices
    this.instrument = new Instrument(this.patch, this.sampleRate, voices, this.samples, this.tempo, this.expression)
  }

  setClips(clips: readonly (Clip | null)[]): void {
    this.clips = clips
    this.launcher.syncClips(clips)
  }

  setAutomationNoteGraph(patch?: Patch): void {
    if (!patch) this.noteControls = undefined
    else if (!this.noteControls?.sync(patch)) this.noteControls = new NoteControlGraph(patch, this.sampleRate)
  }

  get hasNoteControls(): boolean { return this.noteControls?.clocked === true }

  setAutomationParam(nodeId: string, paramId: string, value: number, graph: 'patch' | 'fx' | 'notes'): void {
    if (graph === 'notes') { this.graph.setParam(nodeId, paramId, value); this.noteControls?.setParam(nodeId, paramId, value) }
    else if (graph === 'patch') this.instrument.setParam(nodeId, paramId, value)
    else this.fx.setParam(nodeId, paramId, value)
  }

  clearAutomation(): void { this.fx.clearAutomation(); this.instrument.clearAutomation() }
  setAutomationCurve(nodeId: string, paramId: string, values: Float64Array, graph: 'patch' | 'fx' | 'notes'): void {
    if (graph === 'patch') this.instrument.setAutomationCurve(nodeId, paramId, values)
    else if (graph === 'fx') this.fx.setAutomationCurve(nodeId, paramId, values)
    else this.graph.setParam(nodeId, paramId, values[0]!)
  }

  setParam(nodeId: string, paramId: string, value: number, graph?: 'patch' | 'fx' | 'notes'): void {
    if (graph === 'notes') { this.graph.setParam(nodeId, paramId, value); this.noteControls?.setParam(nodeId, paramId, value); return }
    if (graph !== 'fx') {
      this.patch = setNodeParam(this.patch, nodeId, paramId, value)
      this.instrument.setParam(nodeId, paramId, value)
    }
    if (graph !== 'patch') this.fx.setParam(nodeId, paramId, value)
  }

  readouts(): Readonly<Record<string, number>> {
    return { ...this.instrument.readouts(), ...this.fx.readouts() }
  }

  setSample(nodeId: string, sampleId: string | null): void {
    this.instrument.setSample(nodeId, sampleId)
    this.fx.setSample(nodeId, sampleId)
  }

  launchClip(clipId: string): void {
    const clip = this.clips.find((candidate) => candidate?.id === clipId)
    if (clip) this.launcher.launch(clip)
  }

  stopClip(): void {
    this.launcher.stop()
  }

  status(): LauncherStatus {
    return this.launcher.status()
  }

  setArrangement(clips: readonly ArrangementClip[]): void {
    // The command carries every track's regions; this runtime plays only its own.
    this.arrangement.setRegions(clips.filter((clip) => clip.trackId === this.trackId))
  }

  /** Switches the event source; notes of the other one are released, so nothing is left sounding. */
  setMode(mode: PlaybackMode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.cancelNotes()
    if (mode === 'arrangement') this.launcher.reset()
    else this.arrangement.reset()
  }

  schedule(from: number, to: number, board: TapBoard, transportFrom?: number, transportTo?: number): ScheduledAction[] {
    this.noteControls?.process((nodeId, paramId, value) => this.graph.setParam(nodeId, paramId, value))
    // Clips follow transport; the graph follows a continuous render clock even while stopped.
    if (transportFrom !== undefined) this.beatOrigin = from - transportFrom
    const rangeTo = transportTo ?? (transportFrom ?? from) + (to - from)
    const sourceEvents = transportFrom === undefined
      ? EMPTY_EVENTS
      : this.mode === 'arrangement'
        ? this.arrangement.collectEvents(transportFrom, rangeTo)
        : this.launcher.collectEvents(transportFrom, rangeTo)
    const clipEvents = sourceEvents.map((event) => ({ ...event, beat: from + event.beat - transportFrom! }))
    const live = this.live.take(from)
    const input = live.length ? [...clipEvents, ...live].sort((a, b) => a.beat - b.beat) : clipEvents
    let events = this.graph.process(input, from, to, board, this.beatOrigin)
    if (this.cancellations.length) events = [...this.cancellations.map((scope): NoteEvent => ({ beat: from, kind: 'allOff', ...(scope ? { scope } : {}) })), ...events]
    this.cancellations.length = 0
    this.tap.clip = input
    this.tap.out = events
    board.set(this.trackId, this.tap)
    return events.map((event) => ({ beat: event.beat, run: () => this.apply(event) }))
  }

  launchScene(scene: number): void {
    const clip = this.clips[scene]
    if (clip) this.launcher.launch(clip)
    else this.launcher.stop()
  }

  /** Returns to silence and an idle launcher (transport stopped). */
  reset(): void {
    this.launcher.reset()
    this.arrangement.reset()
    this.live.clear()
    this.cancellations = []
    this.graph.reset()
    this.audition = null
    this.instrument.allNotesOff()
  }

  /** Plays one short note through this track's instrument (hearing a note while editing it). */
  auditionNote(pitch: number, velocity: number): void {
    this.endAudition()
    this.instrument.noteOn(pitch, velocity)
    this.audition = { pitch, framesLeft: Math.round(AUDITION_SECONDS * this.sampleRate) }
  }

  private endAudition(): void {
    if (this.audition) this.instrument.noteOff(this.audition.pitch)
    this.audition = null
  }

  private apply(event: NoteEvent): void {
    switch (event.kind) {
      case 'noteOn':
        this.instrument.noteOn(event.pitch, event.velocity, event.identity)
        break
      case 'noteOff':
        this.instrument.noteOff(event.pitch, event.identity)
        break
      case 'allOff':
        this.instrument.allNotesOff(event.scope)
        break
    }
  }

  /** Adds `frames` samples of this track, through its insert graph and through its channel strip, into the stereo buses. */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, mix: MixContext): void {
    const dry = this.instrument.render(frames)
    mix.taps.write(this.trackId, 0, dry, frames)
    const sends = this.strip.sendsTo(mix.sends)
    const signal = this.fx.process(dry, frames, { sends, taps: mix.taps })
    mix.taps.write(this.trackId, 1, signal, frames)
    this.strip.mixInto(left, right, offset, frames, signal)
    for (const [returnId, level] of this.sendList) this.strip.send(sends, returnId, signal, level, frames)
    if (this.audition) {
      this.audition.framesLeft -= frames
      if (this.audition.framesLeft <= 0) this.endAudition()
    }
  }
}
