import { clamp } from '../shared'

/** Sample-accurate musical clock. Time is measured in beats and advanced per audio block. */
export class Transport {
  playing = false
  positionBeats = 0
  tempo = 120

  constructor(private readonly sampleRate: number) {}

  play(): void {
    this.playing = true
  }

  /** Stops and rewinds to the start. */
  stop(): void {
    this.playing = false
    this.positionBeats = 0
  }

  setTempo(bpm: number): void {
    this.tempo = bpm
  }

  get beatsPerSample(): number {
    return this.tempo / 60 / this.sampleRate
  }

  /** Beat position `frames` samples from now. */
  beatAfter(frames: number): number {
    return this.positionBeats + frames * this.beatsPerSample
  }

  /** Sample offset within the current block at which `beat` falls. */
  frameOf(beat: number, blockFrames: number): number {
    const frame = Math.round((beat - this.positionBeats) / this.beatsPerSample)
    return clamp(frame, 0, blockFrames - 1)
  }

  advance(frames: number): void {
    if (this.playing) this.positionBeats = this.beatAfter(frames)
  }
}
