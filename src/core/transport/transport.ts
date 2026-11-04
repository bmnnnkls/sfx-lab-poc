import { clamp } from '../shared'

/** A range of beats the arrangement repeats. */
export interface TransportLoop {
  readonly from: number
  readonly to: number
}

/** Sample-accurate musical clock. Time is measured in beats and advanced per audio block. */
export class Transport {
  playing = false
  positionBeats = 0
  tempo = 120
  /** The range the arrangement repeats, or null; the engine applies it only while the arrangement plays. */
  loop: TransportLoop | null = null
  /**
   * Where the current block's events end when that is before the position after it: the loop's end, in the block
   * that runs into it, so an event at the end belongs to the next pass. Infinity otherwise.
   */
  private eventsEnd = Infinity
  /**
   * Where the current block's events start when that is before the position: the loop's start, right after a jump
   * whose overshoot (under a sample) was carried past it, so an event at the start still sounds. Null otherwise.
   */
  private eventsStart: number | null = null

  constructor(private readonly sampleRate: number) {}

  play(): void {
    this.playing = true
  }

  /** Stops and rewinds to the start. */
  stop(): void {
    this.playing = false
    this.positionBeats = 0
    this.eventsStart = null
  }

  setTempo(bpm: number): void {
    this.tempo = bpm
  }

  /** Jumps to `beats`, playing or stopped. With `eventsFrom`, the next block's events start there instead. */
  seek(beats: number, eventsFrom?: number): void {
    this.positionBeats = Math.max(0, beats)
    this.eventsStart = eventsFrom === undefined ? null : Math.max(0, Math.min(eventsFrom, this.positionBeats))
  }

  get beatsPerSample(): number {
    return this.tempo / 60 / this.sampleRate
  }

  /** Beat position `frames` samples from now. */
  beatAfter(frames: number): number {
    return this.positionBeats + frames * this.beatsPerSample
  }

  /** Where the events of a range starting `frames` into the block start: `beatAfter`, or the loop's start after a jump. */
  eventsFrom(frames: number): number {
    return frames === 0 && this.eventsStart !== null ? this.eventsStart : this.beatAfter(frames)
  }

  /** Where the events of a range ending `frames` into the block end: `beatAfter`, cut at the loop's end. */
  eventsTo(frames: number): number {
    return Math.min(this.beatAfter(frames), this.eventsEnd)
  }

  /**
   * How many frames the next block may have before it reaches the loop's end (at least 1), or null when it can't:
   * no loop, or the position already at or past its end. Sets where that block's events end.
   */
  framesToLoopEnd(): number | null {
    this.eventsEnd = Infinity
    if (!this.loop || this.positionBeats >= this.loop.to) return null
    this.eventsEnd = this.loop.to
    // The last sample before `to`; a sample within rounding of it counts as at it.
    return Math.max(1, Math.ceil((this.loop.to - this.positionBeats) / this.beatsPerSample - 1e-6))
  }

  /**
   * After a block that ran into the loop's end: the beat to jump to, the loop's start plus what the position passed
   * the end by, so the phase stays exact over many passes. Null when the block stopped short of the end.
   */
  loopJump(): number | null {
    const loop = this.loop
    if (!loop || this.eventsEnd === Infinity) return null
    this.eventsEnd = Infinity
    const overshoot = this.positionBeats - loop.to
    if (overshoot < -1e-6 * this.beatsPerSample) return null
    return loop.from + Math.max(0, overshoot)
  }

  /** Sample offset within the current block at which `beat` falls. */
  frameOf(beat: number, blockFrames: number): number {
    const frame = Math.round((beat - this.positionBeats) / this.beatsPerSample)
    return clamp(frame, 0, blockFrames - 1)
  }

  advance(frames: number): void {
    if (this.playing) this.positionBeats = this.beatAfter(frames)
    this.eventsStart = null
  }
}
