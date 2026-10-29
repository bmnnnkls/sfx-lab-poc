import { DEFAULT_TEMPO, STEREO_FRAMES } from '../dsp'
import { FxGraph } from '../instrument'
import { type Patch, audioSources, sendTargets } from '../patch'
import type { SampleLookup } from '../sample'
import type { LauncherStatus } from '../session'
import { ChannelStrip } from './channel-strip'
import type { MixContext, PlayableTrack, PlaybackMode, ScheduledAction } from './playable-track'

const IDLE: LauncherStatus = { playingClipId: null, startBeat: null, queued: null }

/**
 * What a return track and a group bus share: no clips, a stereo input the engine sums for them, an insert graph on it,
 * its taps, and a strip. Each kind says where its input comes from and what its send knobs do.
 */
export abstract class StereoBus implements PlayableTrack {
  readonly strip: ChannelStrip
  private fx: FxGraph
  protected targets: string[]
  private sources: string[]
  /** Used when nothing was summed (no board slot): the graph then runs on silence and its tail rings out. */
  private readonly silence = new Float32Array(STEREO_FRAMES)
  private tempo = DEFAULT_TEMPO

  constructor(
    protected readonly trackId: string,
    fx: Patch,
    volume: number,
    private readonly sampleRate: number,
    private readonly samples: SampleLookup,
  ) {
    this.strip = new ChannelStrip(volume)
    this.fx = new FxGraph(fx, sampleRate, samples)
    this.targets = sendTargets(fx)
    this.sources = audioSources(fx)
  }

  readouts(): Readonly<Record<string, number>> {
    return this.fx.readouts()
  }

  setTempo(bpm: number): void {
    this.tempo = bpm
    this.fx.setTempo(bpm)
  }

  setFx(fx: Patch): void {
    this.fx = new FxGraph(fx, this.sampleRate, this.samples, this.tempo)
    this.targets = sendTargets(fx)
    this.sources = audioSources(fx)
  }

  clearAutomation(): void { this.fx.clearAutomation() }
  setAutomationCurve(nodeId: string, paramId: string, values: Float64Array): void { this.fx.setAutomationCurve(nodeId, paramId, values) }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.fx.setParam(nodeId, paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    this.fx.setSample(nodeId, sampleId)
  }

  abstract setSends(sends: Readonly<Record<string, number>>): void

  launchClip(): void {}
  launchScene(): void {}
  stopClip(): void {}
  reset(): void {}

  /** Buses have no clips; the arrangement only touches the tracks that do. */
  setArrangement(_clips: readonly never[]): void {}
  setMode(_mode: PlaybackMode): void {}

  status(): LauncherStatus {
    return IDLE
  }

  schedule(): ScheduledAction[] {
    return []
  }

  tapSources(): string[] {
    return []
  }

  sendTargets(): string[] {
    return this.targets
  }

  audioSources(): string[] {
    return this.sources
  }

  /** What was summed for this bus in the stretch being mixed, if anything. */
  protected abstract input(mix: MixContext): Float32Array | undefined

  /** Runs the input through the graph, writing the taps before and after it, and returns the result (a stereo buffer). */
  protected process(frames: number, mix: MixContext): Float32Array {
    const input = this.input(mix) ?? this.silence
    mix.taps.write(this.trackId, 0, input, frames)
    const signal = this.fx.process(input, frames, { sends: this.strip.sendsTo(mix.sends), taps: mix.taps })
    mix.taps.write(this.trackId, 1, signal, frames)
    return signal
  }

  abstract mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, mix: MixContext): void
}
