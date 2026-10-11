import { RIGHT } from '../dsp'
import { FxGraph, MAX_BLOCK_FRAMES } from '../instrument'
import { type Patch, sendTargets } from '../patch'
import type { AudioClip, SendLevels } from '../project'
import type { SampleLookup } from '../sample'
import { AudioClipLauncher, type AudioEvent, type LauncherStatus } from '../session'
import { fadeGain, readRegion, regionOf, repitchPosition } from './audio-clip-playback'
import type { AudioBoard } from './audio-board'
import type { MixTiming, PlayableTrack, ScheduledAction } from './playable-track'

/** A clip that stops (or is replaced) keeps sounding for this long, fading to silence, instead of cutting dead. */
const TAIL_SECONDS = 0.005

/** One clip as it is currently being read. */
interface Playing {
  clip: AudioClip
  startBeat: number
  /**
   * Read position in sample frames, used only by clips that ignore tempo (`warp: 'off'`).
   * Negative until the first read, when it is set to the start of the clip's region.
   */
  position: number
}

interface Tail {
  readonly voice: Playing
  framesLeft: number
  readonly total: number
}

/** Live, audio-thread counterpart of an audio Track: launcher plus the player that reads library samples. */
export class AudioTrackRuntime implements PlayableTrack {
  volume: number
  clips: readonly (AudioClip | null)[]
  private readonly launcher = new AudioClipLauncher()
  private playing: Playing | null = null
  private tail: Tail | null = null
  private readonly tailFrames: number
  private fx: FxGraph
  private targets: string[]
  /** The send knobs as pairs of (return track id, level), post-fader. */
  private sendList: ReadonlyArray<readonly [string, number]> = []
  /** The clip audio of the current stretch, before the insert graph. */
  private readonly scratch = new Float32Array(MAX_BLOCK_FRAMES)

  constructor(
    fx: Patch,
    clips: readonly (AudioClip | null)[],
    volume: number,
    private readonly samples: SampleLookup,
    private readonly sampleRate: number,
  ) {
    this.clips = clips
    this.volume = volume
    this.tailFrames = Math.max(1, Math.round(TAIL_SECONDS * sampleRate))
    this.fx = new FxGraph(fx, sampleRate, samples)
    this.targets = sendTargets(fx)
  }

  setFx(fx: Patch): void {
    this.fx = new FxGraph(fx, this.sampleRate, this.samples)
    this.targets = sendTargets(fx)
  }

  setSends(sends: SendLevels): void {
    this.sendList = Object.entries(sends)
  }

  sendTargets(): string[] {
    return [...new Set([...this.targets, ...this.sendList.map(([id]) => id)])]
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.fx.setParam(nodeId, paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    this.fx.setSample(nodeId, sampleId)
  }

  setClips(clips: readonly (AudioClip | null)[]): void {
    this.clips = clips
    this.launcher.syncClips(clips)
    // Edited settings (gain, trim, fades, loop…) apply to the clip that is sounding right now.
    if (this.playing) {
      const edited = clips.find((clip) => clip?.id === this.playing?.clip.id) ?? null
      this.playing = edited ? { ...this.playing, clip: edited } : null
    }
  }

  launchClip(clipId: string): void {
    const clip = this.clips.find((candidate) => candidate?.id === clipId)
    if (clip) this.launcher.launch(clip)
  }

  launchScene(scene: number): void {
    const clip = this.clips[scene]
    if (clip) this.launcher.launch(clip)
    else this.launcher.stop()
  }

  stopClip(): void {
    this.launcher.stop()
  }

  reset(): void {
    this.launcher.reset()
    this.fadeOutPlaying()
    this.playing = null
  }

  /** What is sounding (not just queued, and not a fading tail), so a finished one-shot stops showing as playing. */
  status(): LauncherStatus {
    return {
      playingClipId: this.playing?.clip.id ?? null,
      startBeat: this.playing?.startBeat ?? null,
      queued: this.launcher.queuedStatus(),
    }
  }

  tapSources(): string[] {
    return []
  }

  schedule(from: number, to: number): ScheduledAction[] {
    return this.launcher
      .collectEvents(from, to)
      .map((event) => ({ beat: event.beat, run: () => this.apply(event) }))
  }

  private apply(event: AudioEvent): void {
    this.fadeOutPlaying()
    this.playing = event.kind === 'start' ? { clip: event.clip, startBeat: event.beat, position: -1 } : null
  }

  /** Hands what is sounding over to a short fade-out, so whatever replaces it (or silence) starts without a click. */
  private fadeOutPlaying(): void {
    if (this.playing) this.tail = { voice: this.playing, framesLeft: this.tailFrames, total: this.tailFrames }
  }

  /** The clip audio goes through the insert graph (which keeps ringing after the clip ends), then the fader. */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, timing: MixTiming, board: AudioBoard): void {
    this.scratch.fill(0, 0, frames)
    if (this.tail) {
      const alive = this.mixVoice(this.tail.voice, frames, timing, this.tail)
      this.tail.framesLeft -= frames
      if (!alive || this.tail.framesLeft <= 0) this.tail = null
    }
    if (this.playing && !this.mixVoice(this.playing, frames, timing)) this.playing = null

    const signal = this.fx.process(this.scratch, frames, board)
    for (let i = 0; i < frames; i++) {
      left[offset + i] = (left[offset + i] ?? 0) + (signal[i] ?? 0) * this.volume
      right[offset + i] = (right[offset + i] ?? 0) + (signal[RIGHT + i] ?? 0) * this.volume
    }
    for (const [returnId, level] of this.sendList) board.add(returnId, signal, level * this.volume, frames)
  }

  /** Adds `frames` of `voice` to the scratch buffer. Returns false once the clip has finished (a non-looping pass ended). */
  private mixVoice(voice: Playing, frames: number, timing: MixTiming, tail?: Tail): boolean {
    const sample = this.samples.get(voice.clip.sampleId)
    if (!sample) return true // a sample that hasn't arrived yet just plays silence, then joins in phase

    const { clip } = voice
    const { data } = sample
    const region = regionOf(clip.start, clip.end, data.length)
    const regionLength = region.endPos - region.startPos
    const fadeInFrames = clip.fadeIn * sample.sampleRate
    const fadeOutFrames = clip.fadeOut * sample.sampleRate
    const gain = clip.gain
    const nativeSpeed = sample.sampleRate / this.sampleRate
    if (voice.position < 0) voice.position = region.startPos

    for (let i = 0; i < frames; i++) {
      let position: number | null
      if (clip.warp === 'repitch') {
        position = repitchPosition(
          timing.beat + i * timing.beatsPerSample - voice.startBeat,
          clip.lengthBeats,
          clip.loop,
          region,
        )
      } else {
        position = voice.position
        if (position >= region.endPos) {
          position = clip.loop ? region.startPos + ((position - region.startPos) % regionLength) : null
        }
        if (position !== null) voice.position = position + nativeSpeed
      }
      if (position === null) return false

      let level = gain * fadeGain(position, region, fadeInFrames, fadeOutFrames)
      if (tail) {
        const remaining = tail.framesLeft - i
        if (remaining <= 0) return false
        level *= remaining / tail.total
      }
      const value = readRegion(data, position, region, clip.loop) * level
      this.scratch[i] = (this.scratch[i] ?? 0) + value
    }
    return true
  }
}
