import { Params } from '../params'
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

/**
 * Three RBJ biquads in series — a low shelf, a peak, a high shelf — redesigned only when a
 * parameter changes. Every gain default is 0, so untouched settings are an exact passthrough.
 */
class Eq implements DspNode {
  private readonly params = new Params(PARAMS)
  private low: Coefficients | null = null
  private mid: Coefficients | null = null
  private high: Coefficients | null = null
  private lowZ1 = 0
  private lowZ2 = 0
  private midZ1 = 0
  private midZ2 = 0
  private highZ1 = 0
  private highZ2 = 0

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

    for (let i = 0; i < frames; i++) {
      let x = input?.[i] ?? 0
      let y = low.b0 * x + this.lowZ1
      this.lowZ1 = low.b1 * x - low.a1 * y + this.lowZ2
      this.lowZ2 = low.b2 * x - low.a2 * y
      x = y
      y = mid.b0 * x + this.midZ1
      this.midZ1 = mid.b1 * x - mid.a1 * y + this.midZ2
      this.midZ2 = mid.b2 * x - mid.a2 * y
      x = y
      y = high.b0 * x + this.highZ1
      this.highZ1 = high.b1 * x - high.a1 * y + this.highZ2
      this.highZ2 = high.b2 * x - high.a2 * y
      out[i] = y
    }
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
