import { clamp } from '../shared'

/** The metronome's level range and default, in dB. */
export const METRONOME_MIN_DB = -40
export const METRONOME_MAX_DB = 0
export const METRONOME_DEFAULT_DB = -12
/** How long one click sounds, and how fast it starts. */
const CLICK_SECONDS = 0.025
const ATTACK_SECONDS = 0.001
/** The first beat of a bar (4/4) clicks higher than the others. */
const BAR_HZ = 1500
const BEAT_HZ = 1000
const BEATS_PER_BAR = 4

interface Click { age: number; readonly step: number }

/**
 * Clicks on every whole beat while the transport plays: a 25 ms sine burst with a 1 ms attack and an exponential
 * decay. The engine mixes it after the master graph and fader, like the sample preview, so effects never colour it.
 * Off until `set` turns it on, so an engine built for a bounce never clicks.
 */
export class Metronome {
  private on = false
  private gain = dbToGain(METRONOME_DEFAULT_DB)
  private readonly clicks: Click[] = []
  private readonly length: number
  private readonly attack: number
  private readonly decay: number
  /** The last whole beat clicked, so a beat is never clicked twice; reset by a jump back or a stop. */
  private lastBeat = -Infinity

  constructor(private readonly sampleRate: number) {
    this.length = Math.round(CLICK_SECONDS * sampleRate)
    this.attack = Math.max(1, Math.round(ATTACK_SECONDS * sampleRate))
    // Down by about 60 dB at the end of the click.
    this.decay = 6.9 / (this.length - this.attack)
  }

  set(on: boolean, levelDb: number): void {
    this.on = on
    this.gain = dbToGain(clamp(Number.isFinite(levelDb) ? levelDb : METRONOME_DEFAULT_DB, METRONOME_MIN_DB, METRONOME_MAX_DB))
    if (!on) this.clicks.length = 0
  }

  /**
   * Adds the clicks of a block of `frames` samples at `offset` into the buffers. `fromBeat` is the transport's beat at
   * the block's first sample, or null while it is stopped; a count-in passes its own beats (negative, up to 0) and
   * `force`, which clicks them even while the metronome is off. A click starts on the first sample at or after its beat
   * and runs on into the next blocks.
   */
  mixInto(left: Float32Array, right: Float32Array, offset: number, frames: number, fromBeat: number | null, beatsPerSample: number, force = false): void {
    if (fromBeat === null) this.lastBeat = -Infinity
    else if (fromBeat < this.lastBeat) this.lastBeat = -Infinity
    if ((this.on || force) && fromBeat !== null && beatsPerSample > 0) {
      for (let beat = Math.max(Math.ceil(fromBeat - beatsPerSample), this.lastBeat + 1); ; beat++) {
        const frame = Math.ceil((beat - fromBeat) / beatsPerSample - 1e-6)
        if (frame < 0) continue
        if (frame >= frames) break
        const hz = ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0 ? BAR_HZ : BEAT_HZ
        this.clicks.push({ age: -frame, step: (2 * Math.PI * hz) / this.sampleRate })
        this.lastBeat = beat
      }
    }
    for (let c = this.clicks.length - 1; c >= 0; c--) {
      const click = this.clicks[c]!
      for (let i = Math.max(0, -click.age); i < frames; i++) {
        const t = click.age + i
        if (t >= this.length) break
        const envelope = t < this.attack ? t / this.attack : Math.exp(-(t - this.attack) * this.decay)
        const sample = Math.sin(click.step * t) * envelope * this.gain
        left[offset + i] = (left[offset + i] ?? 0) + sample
        right[offset + i] = (right[offset + i] ?? 0) + sample
      }
      click.age += frames
      if (click.age >= this.length) this.clicks.splice(c, 1)
    }
  }
}

const dbToGain = (db: number): number => Math.pow(10, db / 20)
