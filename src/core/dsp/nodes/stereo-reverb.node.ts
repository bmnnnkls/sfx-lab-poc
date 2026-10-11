import { Params } from '../params'
import { RIGHT } from '../stereo'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'
import {
  INPUT_GAIN,
  MAX_PREDELAY_SECONDS,
  REVERB_PARAMS,
  ReverbTank,
  STEREO_SPREAD,
  WET_GAIN,
  reverbDamping,
  reverbFeedback,
} from './reverb-tank'

/**
 * A reverb with a left and a right tank: the same Freeverb as the mono node, with the right tank's delays a little
 * longer, so even a mono source comes out wide (the two channels differ) while their sum is still a clean reverb.
 * Stereo in (a mono signal is heard in both channels), stereo out. Mix 0 passes the input through untouched.
 */
class StereoReverb implements DspNode {
  private readonly params = new Params(REVERB_PARAMS)
  private readonly left: ReverbTank
  private readonly right: ReverbTank
  private readonly predelay: Float32Array
  private predelayIndex = 0

  constructor(sampleRate: number) {
    this.left = new ReverbTank(sampleRate)
    this.right = new ReverbTank(sampleRate, STEREO_SPREAD)
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
    const delaySamples = Math.min(this.predelay.length - 1, Math.round((this.params.get('predelay') / 1000) * sampleRate))

    for (let i = 0; i < frames; i++) {
      const dryLeft = input?.[i] ?? 0
      const dryRight = input?.[RIGHT + i] ?? 0

      // Both tanks hear the same mono sum, as in Freeverb; what makes the channels differ is the tanks.
      this.predelay[this.predelayIndex] = (dryLeft + dryRight) * 0.5
      const readIndex = (this.predelayIndex - delaySamples + this.predelay.length) % this.predelay.length
      const fed = (this.predelay[readIndex] ?? 0) * INPUT_GAIN
      this.predelayIndex = (this.predelayIndex + 1) % this.predelay.length

      out[i] = dryLeft * (1 - mix) + this.left.process(fed, feedback, damping) * WET_GAIN * mix
      out[RIGHT + i] = dryRight * (1 - mix) + this.right.process(fed, feedback, damping) * WET_GAIN * mix
    }
  }
}

export const stereoReverbNode: NodeDefinition = {
  type: 'stereoReverb',
  label: 'Stereo reverb',
  inputs: [{ id: 'in', label: 'In', kind: 'stereo' }],
  outputs: [{ id: 'out', label: 'Out', kind: 'stereo' }],
  params: REVERB_PARAMS,
  shared: true,
  insertOnly: true,
  create: (sampleRate) => new StereoReverb(sampleRate),
}
