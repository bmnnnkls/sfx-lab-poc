import { Instrument } from '../instrument'
import type { Patch } from '../patch'
import type { Clip } from '../project'
import type { SampleLookup } from '../sample'
import { ClipLauncher, type LauncherStatus, type NoteEvent } from '../session'
import type { PlayableTrack, ScheduledAction } from './playable-track'

/** How long an audition note sounds before it is released. */
const AUDITION_SECONDS = 0.3

/** Live, audio-thread counterpart of a project Track: voice + clip player + level. */
export class TrackRuntime implements PlayableTrack {
  private readonly launcher = new ClipLauncher()
  volume: number
  clips: readonly (Clip | null)[]
  private instrument: Instrument
  private audition: { pitch: number; framesLeft: number } | null = null

  constructor(
    private patch: Patch,
    clips: readonly (Clip | null)[],
    volume: number,
    private voices: number,
    private readonly sampleRate: number,
    private readonly samples: SampleLookup,
  ) {
    this.instrument = new Instrument(patch, sampleRate, voices, samples)
    this.clips = clips
    this.volume = volume
  }

  setPatch(patch: Patch): void {
    this.audition = null
    this.patch = patch
    this.instrument = new Instrument(patch, this.sampleRate, this.voices, this.samples)
  }

  setVoices(voices: number): void {
    this.audition = null
    this.voices = voices
    this.instrument = new Instrument(this.patch, this.sampleRate, voices, this.samples)
  }

  setClips(clips: readonly (Clip | null)[]): void {
    this.clips = clips
    this.launcher.syncClips(clips)
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.instrument.setParam(nodeId, paramId, value)
  }

  setSample(nodeId: string, sampleId: string | null): void {
    this.instrument.setSample(nodeId, sampleId)
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

  schedule(from: number, to: number): ScheduledAction[] {
    return this.launcher
      .collectEvents(from, to)
      .map((event) => ({ beat: event.beat, run: () => this.apply(event) }))
  }

  launchScene(scene: number): void {
    const clip = this.clips[scene]
    if (clip) this.launcher.launch(clip)
    else this.launcher.stop()
  }

  /** Returns to silence and an idle launcher (transport stopped). */
  reset(): void {
    this.launcher.reset()
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

  /** Adds `frames` samples of this track, scaled by its volume, into the stereo buses. */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number): void {
    const signal = this.instrument.render(frames)
    for (let i = 0; i < frames; i++) {
      const sample = (signal[i] ?? 0) * this.volume
      left[offset + i] = (left[offset + i] ?? 0) + sample
      right[offset + i] = (right[offset + i] ?? 0) + sample
    }
    if (this.audition) {
      this.audition.framesLeft -= frames
      if (this.audition.framesLeft <= 0) this.endAudition()
    }
  }
}
