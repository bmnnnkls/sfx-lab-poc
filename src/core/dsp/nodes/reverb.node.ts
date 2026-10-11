import { Params } from '../params'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'
import {
  INPUT_GAIN,
  MAX_PREDELAY_SECONDS,
  REVERB_PARAMS as PARAMS,
  ReverbTank,
  WET_GAIN,
  reverbDamping,
  reverbFeedback,
} from './reverb-tank'

/**
 * Freeverb-style reverb: eight damped feedback combs in parallel smear the input into a dense tail,
 * four allpasses in series diffuse it. Mono in, mono out. Mix 0 passes the input through untouched.
 */
class Reverb implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly tank: ReverbTank
  private readonly predelay: Float32Array
  private predelayIndex = 0

  constructor(sampleRate: number) {
    this.tank = new ReverbTank(sampleRate)
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
    const feedback = reverbFeedback(this.params.get('size'))
    const damping = reverbDamping(this.params.get('damping'))
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
      const wet = this.tank.process(fed, feedback, damping)

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
