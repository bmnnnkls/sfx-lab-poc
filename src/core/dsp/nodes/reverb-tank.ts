import type { ParamSpec } from '../types'

export const MAX_PREDELAY_SECONDS = 0.1

export const REVERB_PARAMS: readonly ParamSpec[] = [
  { id: 'size', label: 'Size', min: 0, max: 1, default: 0.6, step: 0.01 },
  { id: 'damping', label: 'Damp', min: 0, max: 1, default: 0.5, step: 0.01 },
  { id: 'predelay', label: 'Predelay', min: 0, max: MAX_PREDELAY_SECONDS * 1000, default: 0, step: 1, unit: 'ms' },
  { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.3, step: 0.01 },
]

export const INPUT_GAIN = 0.015
export const WET_GAIN = 3

/** 0.7..0.98 feedback: from a short room to a tail of many seconds, always below instability. */
export const reverbFeedback = (size: number): number => 0.7 + size * 0.28
export const reverbDamping = (damping: number): number => damping * 0.4

// Freeverb's delay lengths in samples at 44.1 kHz: mutually unrelated so the echoes do not line up.
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const ALLPASS_TUNING = [556, 441, 341, 225]
const ALLPASS_FEEDBACK = 0.5
const REFERENCE_RATE = 44100

/** Freeverb's stereo spread: the right channel's delay lengths are this much longer (samples at 44.1 kHz). */
export const STEREO_SPREAD = 23

/** Values this small are inaudible but make the CPU slow when they decay into denormals. */
const flush = (value: number): number => (Math.abs(value) < 1e-20 ? 0 : value)

class Comb {
  private readonly buffer: Float32Array
  private index = 0
  private store = 0

  constructor(length: number) {
    this.buffer = new Float32Array(length)
  }

  /** Feedback comb with a one-pole lowpass in the loop, so high frequencies die out first. */
  process(input: number, feedback: number, damping: number): number {
    const output = this.buffer[this.index] ?? 0
    this.store = flush(output * (1 - damping) + this.store * damping)
    this.buffer[this.index] = input + this.store * feedback
    this.index = (this.index + 1) % this.buffer.length
    return output
  }
}

class Allpass {
  private readonly buffer: Float32Array
  private index = 0

  constructor(length: number) {
    this.buffer = new Float32Array(length)
  }

  process(input: number): number {
    const buffered = this.buffer[this.index] ?? 0
    this.buffer[this.index] = flush(input + buffered * ALLPASS_FEEDBACK)
    this.index = (this.index + 1) % this.buffer.length
    return buffered - input
  }
}

/**
 * Freeverb's reverberator for one channel: eight damped feedback combs in parallel smear the input into a dense
 * tail, four allpasses in series diffuse it. `spread` lengthens every delay by that many samples (at 44.1 kHz), which
 * is how a second tank with the same settings gives a decorrelated right channel.
 */
export class ReverbTank {
  private readonly combs: Comb[]
  private readonly allpasses: Allpass[]

  constructor(sampleRate: number, spread = 0) {
    const scale = (length: number) => Math.max(1, Math.round(((length + spread) * sampleRate) / REFERENCE_RATE))
    this.combs = COMB_TUNING.map((length) => new Comb(scale(length)))
    this.allpasses = ALLPASS_TUNING.map((length) => new Allpass(scale(length)))
  }

  process(input: number, feedback: number, damping: number): number {
    let wet = 0
    for (const comb of this.combs) wet += comb.process(input, feedback, damping)
    for (const allpass of this.allpasses) wet = allpass.process(wet)
    return wet
  }
}
