import { DEFAULT_TEMPO } from '../dsp'
import { FxGraph, Instrument } from '../instrument'
import { NoteGraph, type TapBoard } from '../notefx'
import { type Patch, audioSources, sendTargets } from '../patch'
import type { Clip, SendLevels } from '../project'
import type { SampleLookup } from '../sample'
import { ClipLauncher, type LauncherStatus, type NoteEvent } from '../session'
import { ChannelStrip } from './channel-strip'
import type { MixContext, PlayableTrack, ScheduledAction } from './playable-track'

/** How long an audition note sounds before it is released. */
const AUDITION_SECONDS = 0.3

/** Live, audio-thread counterpart of a project Track: voice + clip player + level. */
export class TrackRuntime implements PlayableTrack {
  private readonly launcher = new ClipLauncher()
  private readonly graph = new NoteGraph()
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
    this.instrument = new Instrument(patch, sampleRate, voices, samples)
    this.fx = new FxGraph(fx, sampleRate, samples)
    this.targets = sendTargets(fx)
    this.sources = audioSources(fx)
    this.clips = clips
    this.strip = new ChannelStrip(volume)
    this.graph.sync(noteGraph)
  }

  /** Replaces the note graph. Knob changes keep running state; structural changes restart it. */
  setNoteGraph(graph: Patch): void {
    this.graph.sync(graph)
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

  setParam(nodeId: string, paramId: string, value: number): void {
    this.instrument.setParam(nodeId, paramId, value)
    this.fx.setParam(nodeId, paramId, value)
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

  schedule(from: number, to: number, board: TapBoard): ScheduledAction[] {
    const clipEvents = this.launcher.collectEvents(from, to)
    const events = this.graph.process(clipEvents, from, to, board)
    board.set(this.trackId, { clip: clipEvents, out: events })
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

  /**
   * A note played live (a MIDI keyboard): straight to the instrument, whether or not the transport runs, and held until its
   * note-off. It does not go through the note graph, which works on the clip's beat-timed events.
   */
  liveNoteOn(pitch: number, velocity: number): void {
    if (this.audition?.pitch === pitch) this.audition = null
    this.instrument.noteOn(pitch, velocity)
  }

  liveNoteOff(pitch: number): void {
    this.instrument.noteOff(pitch)
  }

  private endAudition(): void {
    if (this.audition) this.instrument.noteOff(this.audition.pitch)
    this.audition = null
  }

  private apply(event: NoteEvent): void {
    switch (event.kind) {
      case 'noteOn':
        this.instrument.noteOn(event.pitch, event.velocity)
        break
      case 'noteOff':
        this.instrument.noteOff(event.pitch)
        break
      case 'allOff':
        this.instrument.allNotesOff()
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
    for (const [returnId, level] of this.sendList) sends.add(returnId, signal, level * this.strip.volume, frames)
    if (this.audition) {
      this.audition.framesLeft -= frames
      if (this.audition.framesLeft <= 0) this.endAudition()
    }
  }
}
