import { Params } from '../params'
import { RIGHT, STEREO_FRAMES } from '../stereo'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'
import { designBiquad, FILTER_MODES, type Coefficients } from './biquad'

/** All gains at 0 leave the sound untouched; the shelves sit at RBJ's S = 1 (Q 0.707). */
const SHELF_Q = 0.707

const PARAMS: readonly ParamSpec[] = [
  { id: 'lowFreq', label: 'Low Hz', min: 20, max: 500, default: 120, unit: 'Hz' },
  { id: 'lowGain', label: 'Low', min: -18, max: 18, default: 0, unit: 'dB' },
  { id: 'midFreq', label: 'Mid Hz', min: 200, max: 8000, default: 1000, unit: 'Hz' },
  { id: 'midGain', label: 'Mid', min: -18, max: 18, default: 0, unit: 'dB' },
  { id: 'midQ', label: 'Mid Q', min: 0.1, max: 10, default: 1 },
  { id: 'highFreq', label: 'High Hz', min: 1000, max: 20000, default: 6000, unit: 'Hz' },
  { id: 'highGain', label: 'High', min: -18, max: 18, default: 0, unit: 'dB' },
]

/** One biquad's two state samples (transposed direct form II). */
interface Stage {
  z1: number
  z2: number
}

const newStage = (): Stage => ({ z1: 0, z2: 0 })

/**
 * Three RBJ biquads in series — a low shelf, a peak, a high shelf — redesigned only when a
 * parameter changes. Every gain default is 0, so untouched settings are an exact passthrough.
 * Both channels of a stereo buffer share the coefficients and keep their own filter state.
 */
class Eq implements DspNode {
  private readonly params = new Params(PARAMS)
  private low: Coefficients | null = null
  private mid: Coefficients | null = null
  private high: Coefficients | null = null
  /** One stage per band per channel: the left channel's stages in [0], the right's in [1]. */
  private readonly stages = [
    [newStage(), newStage(), newStage()],
    [newStage(), newStage(), newStage()],
  ]

  setParam(id: string, value: number): void {
    if (this.params.set(id, value)) this.low = this.mid = this.high = null
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [input]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    const low = this.low ??= designBiquad(FILTER_MODES.indexOf('low shelf'), this.params.get('lowFreq'), SHELF_Q, sampleRate, this.params.get('lowGain'))
    const mid = this.mid ??= designBiquad(FILTER_MODES.indexOf('peak'), this.params.get('midFreq'), this.params.get('midQ'), sampleRate, this.params.get('midGain'))
    const high = this.high ??= designBiquad(FILTER_MODES.indexOf('high shelf'), this.params.get('highFreq'), SHELF_Q, sampleRate, this.params.get('highGain'))
    const coefficients = [low, mid, high]
    const stereo = out.length === STEREO_FRAMES

    for (let i = 0; i < frames; i++) {
      out[i] = this.chain(coefficients, this.stages[0]!, input?.[i] ?? 0)
      if (stereo) out[RIGHT + i] = this.chain(coefficients, this.stages[1]!, input?.[RIGHT + i] ?? 0)
    }
  }

  /** One sample through the three bands, with the filter state of one channel. */
  private chain(coefficients: readonly Coefficients[], stages: readonly Stage[], x: number): number {
    let y = x
    for (let band = 0; band < coefficients.length; band++) {
      const c = coefficients[band]!
      const stage = stages[band]!
      const filtered = c.b0 * y + stage.z1
      stage.z1 = c.b1 * y - c.a1 * filtered + stage.z2
      stage.z2 = c.b2 * y - c.a2 * filtered
      y = filtered
    }
    return y
  }
}

export const eqNode: NodeDefinition = {
  type: 'eq',
  label: 'EQ',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  shared: true,
  stereoCapable: true,
  create: () => new Eq(),
}
