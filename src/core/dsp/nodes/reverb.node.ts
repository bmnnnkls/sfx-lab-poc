import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const MAX_PREDELAY_SECONDS = 0.1

const PARAMS: readonly ParamSpec[] = [
  { id: 'size', label: 'Size', min: 0, max: 1, default: 0.6, step: 0.01 },
  { id: 'damping', label: 'Damp', min: 0, max: 1, default: 0.5, step: 0.01 },
  { id: 'predelay', label: 'Predelay', min: 0, max: MAX_PREDELAY_SECONDS * 1000, default: 0, step: 1, unit: 'ms' },
  { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.3, step: 0.01 },
]

// Freeverb's delay lengths in samples at 44.1 kHz: mutually unrelated so the echoes do not line up.
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
const ALLPASS_TUNING = [556, 441, 341, 225]
const ALLPASS_FEEDBACK = 0.5
const INPUT_GAIN = 0.015
const WET_GAIN = 3
const REFERENCE_RATE = 44100

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
 * Freeverb-style reverb: eight damped feedback combs in parallel smear the input into a dense tail,
 * four allpasses in series diffuse it. Mono in, mono out. Mix 0 passes the input through untouched.
 */
class Reverb implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly combs: Comb[]
  private readonly allpasses: Allpass[]
  private readonly predelay: Float32Array
  private predelayIndex = 0

  constructor(sampleRate: number) {
    const scale = (length: number) => Math.max(1, Math.round((length * sampleRate) / REFERENCE_RATE))
    this.combs = COMB_TUNING.map((length) => new Comb(scale(length)))
    this.allpasses = ALLPASS_TUNING.map((length) => new Allpass(scale(length)))
    this.predelay = new Float32Array(Math.ceil(MAX_PREDELAY_SECONDS * sampleRate) + 1)
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [input]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    // 0.7..0.98 feedback: from a short room to a tail of many seconds, always below instability.
    const feedback = 0.7 + this.params.get('size') * 0.28
    const damping = this.params.get('damping') * 0.4
    const mix = this.params.get('mix')
    const delaySamples = Math.min(
      this.predelay.length - 1,
      Math.round((this.params.get('predelay') / 1000) * sampleRate),
    )

    for (let i = 0; i < frames; i++) {
      const dry = input?.[i] ?? 0

      this.predelay[this.predelayIndex] = dry
      const readIndex = (this.predelayIndex - delaySamples + this.predelay.length) % this.predelay.length
      const delayed = this.predelay[readIndex] ?? 0
      this.predelayIndex = (this.predelayIndex + 1) % this.predelay.length

      const fed = delayed * INPUT_GAIN
      let wet = 0
      for (const comb of this.combs) wet += comb.process(fed, feedback, damping)
      for (const allpass of this.allpasses) wet = allpass.process(wet)

      out[i] = dry * (1 - mix) + wet * WET_GAIN * mix
    }
  }
}

export const reverbNode: NodeDefinition = {
  type: 'reverb',
  label: 'Reverb',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  shared: true,
  create: (sampleRate) => new Reverb(sampleRate),
}
