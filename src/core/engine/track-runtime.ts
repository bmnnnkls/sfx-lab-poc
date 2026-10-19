import { NoteControlGraph } from '../instrument'
import { DEFAULT_TEMPO } from '../dsp'
import { FxGraph, Instrument } from '../instrument'
import { NoteGraph, type TapBoard } from '../notefx'
import { type Patch, audioSources, sendTargets, setNodeParam } from '../patch'
import type { Clip, SendLevels } from '../project'
import type { SampleLookup } from '../sample'
import { ClipLauncher, type LauncherStatus, type NoteEvent, type NoteScope } from '../session'
import { LiveNotes, clipSource, type LiveNoteAddress } from './live-notes'
import { ChannelStrip } from './channel-strip'
import type { MixContext, PlayableTrack, ScheduledAction } from './playable-track'

/** How long an audition note sounds before it is released. */
const AUDITION_SECONDS = 0.3
const EMPTY_EVENTS: NoteEvent[] = []

/** Live, audio-thread counterpart of a project Track: voice + clip player + level. */
export class TrackRuntime implements PlayableTrack {
  private readonly launcher: ClipLauncher
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
  ) {
    this.launcher = new ClipLauncher(4, clipSource(trackId))
    this.instrument = new Instrument(patch, sampleRate, voices, samples)
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
    this.instrument = new Instrument(patch, this.sampleRate, this.voices, this.samples, this.tempo)
  }

  setVoices(voices: number): void {
    this.audition = null
    this.voices = voices
    this.instrument = new Instrument(this.patch, this.sampleRate, voices, this.samples, this.tempo)
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

  schedule(from: number, to: number, board: TapBoard, transportFrom?: number, transportTo?: number): ScheduledAction[] {
    this.noteControls?.process((nodeId, paramId, value) => this.graph.setParam(nodeId, paramId, value))
    // Clips follow transport; the graph follows a continuous render clock even while stopped.
    if (transportFrom !== undefined) this.beatOrigin = from - transportFrom
    const clipEvents = transportFrom === undefined ? EMPTY_EVENTS : this.launcher.collectEvents(transportFrom, transportTo ?? transportFrom + (to - from))
      .map((event) => ({ ...event, beat: from + event.beat - transportFrom }))
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
