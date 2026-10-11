import { RIGHT, STEREO_FRAMES } from '../dsp'
import { FxGraph } from '../instrument'
import { type Patch, audioSources, sendTargets } from '../patch'
import type { SampleLookup } from '../sample'
import type { LauncherStatus } from '../session'
import type { MixContext, PlayableTrack, ScheduledAction } from './playable-track'

const IDLE: LauncherStatus = { playingClipId: null, startBeat: null, queued: null }

/** Live counterpart of a return track: no clips, only the effects it applies to what the other tracks sent it. */
export class ReturnTrackRuntime implements PlayableTrack {
  volume: number
  private fx: FxGraph
  private targets: string[]
  private sources: string[]
  /** Used when nothing was sent (no board slot): the graph then runs on silence and its tail rings out. */
  private readonly silence = new Float32Array(STEREO_FRAMES)

  constructor(
    private readonly trackId: string,
    fx: Patch,
    volume: number,
    private readonly sampleRate: number,
    private readonly samples: SampleLookup,
  ) {
    this.volume = volume
    this.fx = new FxGraph(fx, sampleRate, samples)
    this.targets = sendTargets(fx)
    this.sources = audioSources(fx)
  }

  setFx(fx: Patch): void {
    this.fx = new FxGraph(fx, this.sampleRate, this.samples)
    this.targets = sendTargets(fx)
    this.sources = audioSources(fx)
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.fx.setParam(nodeId, paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    this.fx.setSample(nodeId, sampleId)
  }

  setSends(): void {}

  launchClip(): void {}
  launchScene(): void {}
  stopClip(): void {}
  reset(): void {}

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

  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, mix: MixContext): void {
    const input = mix.sends.read(this.trackId) ?? this.silence
    mix.taps.write(this.trackId, 0, input, frames)
    const signal = this.fx.process(input, frames, mix)
    mix.taps.write(this.trackId, 1, signal, frames)
    for (let i = 0; i < frames; i++) {
      left[offset + i] = (left[offset + i] ?? 0) + (signal[i] ?? 0) * this.volume
      right[offset + i] = (right[offset + i] ?? 0) + (signal[RIGHT + i] ?? 0) * this.volume
    }
  }
}
