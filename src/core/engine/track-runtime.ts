import { Instrument } from '../instrument'
import type { Patch } from '../patch'
import type { Clip } from '../project'
import { ClipLauncher, type NoteEvent } from '../session'

/** Live, audio-thread counterpart of a project Track: voice + clip player + level. */
export class TrackRuntime {
  readonly launcher = new ClipLauncher()
  volume: number
  clips: readonly (Clip | null)[]
  private instrument: Instrument

  constructor(
    patch: Patch,
    clips: readonly (Clip | null)[],
    volume: number,
    private readonly sampleRate: number,
  ) {
    this.instrument = new Instrument(patch, sampleRate)
    this.clips = clips
    this.volume = volume
  }

  setPatch(patch: Patch): void {
    this.instrument = new Instrument(patch, this.sampleRate)
  }

  setClips(clips: readonly (Clip | null)[]): void {
    this.clips = clips
    this.launcher.syncClips(clips)
  }

  setParam(nodeId: string, paramId: string, value: number): void {
    this.instrument.setParam(nodeId, paramId, value)
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

  /** Returns to silence and an idle launcher (transport stopped). */
  reset(): void {
    this.launcher.reset()
    this.instrument.allNotesOff()
  }

  apply(event: NoteEvent): void {
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
  }
}
