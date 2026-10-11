import type { AudioClip } from '../project'
import { AudioClipLauncher, type AudioEvent, type LauncherStatus } from '../session'
import type { SampleLookup } from '../sample'
import { readInterpolated, repitchPosition } from './audio-clip-playback'
import type { MixTiming, PlayableTrack, ScheduledAction } from './playable-track'

interface Playing {
  clip: AudioClip
  startBeat: number
  /** Read position in the sample, used only by clips that ignore tempo (`warp: 'off'`). */
  position: number
}

/** Live, audio-thread counterpart of an audio Track: launcher plus the player that reads library samples. */
export class AudioTrackRuntime implements PlayableTrack {
  volume: number
  clips: readonly (AudioClip | null)[]
  private readonly launcher = new AudioClipLauncher()
  private playing: Playing | null = null

  constructor(
    clips: readonly (AudioClip | null)[],
    volume: number,
    private readonly samples: SampleLookup,
    private readonly sampleRate: number,
  ) {
    this.clips = clips
    this.volume = volume
  }

  setClips(clips: readonly (AudioClip | null)[]): void {
    this.clips = clips
    this.launcher.syncClips(clips)
    // Edited settings (gain, loop, length…) apply to the clip that is sounding right now.
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
    this.playing = null
  }

  /** What is sounding (not just queued), so a finished one-shot stops showing as playing. */
  status(): LauncherStatus {
    return {
      playingClipId: this.playing?.clip.id ?? null,
      startBeat: this.playing?.startBeat ?? null,
      queued: this.launcher.queuedStatus(),
    }
  }

  schedule(from: number, to: number): ScheduledAction[] {
    return this.launcher
      .collectEvents(from, to)
      .map((event) => ({ beat: event.beat, run: () => this.apply(event) }))
  }

  private apply(event: AudioEvent): void {
    this.playing = event.kind === 'start' ? { clip: event.clip, startBeat: event.beat, position: 0 } : null
  }

  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, timing: MixTiming): void {
    const playing = this.playing
    const sample = playing ? this.samples.get(playing.clip.sampleId) : undefined
    if (!playing || !sample) return // a sample that hasn't arrived yet just plays silence, then joins in phase

    const { clip } = playing
    const { data } = sample
    const gain = clip.gain * this.volume
    const nativeSpeed = sample.sampleRate / this.sampleRate

    for (let i = 0; i < frames; i++) {
      let position: number | null
      if (clip.warp === 'repitch') {
        position = repitchPosition(
          timing.beat + i * timing.beatsPerSample - playing.startBeat,
          clip.lengthBeats,
          clip.loop,
          data.length,
        )
      } else {
        position = playing.position
        if (position >= data.length) position = clip.loop ? position % data.length : null
        playing.position = (position ?? 0) + nativeSpeed
      }

      if (position === null) {
        this.playing = null
        return
      }
      const value = readInterpolated(data, position, clip.loop) * gain
      left[offset + i] = (left[offset + i] ?? 0) + value
      right[offset + i] = (right[offset + i] ?? 0) + value
    }
  }
}
