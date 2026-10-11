import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const MODES = ['lowpass', 'highpass', 'bandpass'] as const

const PARAMS: readonly ParamSpec[] = [
  { id: 'mode', label: 'Mode', min: 0, max: MODES.length - 1, default: 0, step: 1, options: MODES },
  { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, default: 2000, unit: 'Hz' },
  { id: 'resonance', label: 'Res', min: 0.1, max: 20, default: 0.707 },
]

interface Coefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** RBJ cookbook biquad. */
const designBiquad = (mode: number, cutoff: number, q: number, sampleRate: number): Coefficients => {
  const w0 = (2 * Math.PI * Math.min(cutoff, sampleRate * 0.45)) / sampleRate
  const cosW0 = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha

  let b0: number, b1: number, b2: number
  switch (MODES[mode]) {
    case 'highpass':
      b0 = (1 + cosW0) / 2
      b1 = -(1 + cosW0)
      b2 = b0
      break
    case 'bandpass':
      b0 = alpha
      b1 = 0
      b2 = -alpha
      break
    default:
      b0 = (1 - cosW0) / 2
      b1 = 1 - cosW0
      b2 = b0
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cosW0) / a0, a2: (1 - alpha) / a0 }
}

class Filter implements DspNode {
  private readonly params = new Params(PARAMS)
  private coefficients: Coefficients | null = null
  private z1 = 0
  private z2 = 0

  setParam(id: string, value: number): void {
    if (this.params.set(id, value)) this.coefficients = null
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [input]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    this.coefficients ??= designBiquad(
      Math.round(this.params.get('mode')),
      this.params.get('cutoff'),
      this.params.get('resonance'),
      sampleRate,
    )
    const { b0, b1, b2, a1, a2 } = this.coefficients

    for (let i = 0; i < frames; i++) {
      const x = input?.[i] ?? 0
      const y = b0 * x + this.z1
      this.z1 = b1 * x - a1 * y + this.z2
      this.z2 = b2 * x - a2 * y
      out[i] = y
    }
  }
}

export const filterNode: NodeDefinition = {
  type: 'filter',
  label: 'Filter',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  create: () => new Filter(),
}
