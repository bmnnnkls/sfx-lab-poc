import { centsToRatio } from '../../shared'
import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const WAVEFORMS = ['sine', 'saw', 'square', 'triangle'] as const

const PARAMS: readonly ParamSpec[] = [
  { id: 'waveform', label: 'Wave', min: 0, max: WAVEFORMS.length - 1, default: 0, step: 1, options: WAVEFORMS },
  { id: 'frequency', label: 'Freq', min: 20, max: 4000, default: 220, unit: 'Hz' },
  { id: 'detune', label: 'Detune', min: -1200, max: 1200, default: 0, step: 1, unit: 'ct' },
]

const waveAt = (shape: number, phase: number): number => {
  switch (WAVEFORMS[shape]) {
    case 'saw':
      return 2 * phase - 1
    case 'square':
      return phase < 0.5 ? 1 : -1
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5)
    default:
      return Math.sin(2 * Math.PI * phase)
  }
}

/** Naive (non-band-limited) oscillator. The `freq` input overrides the Freq parameter. */
class Oscillator implements DspNode {
  private readonly params = new Params(PARAMS)
  private phase = 0

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(
    { frames, sampleRate }: ProcessContext,
    [frequencyIn]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    const shape = Math.round(this.params.get('waveform'))
    const ratio = centsToRatio(this.params.get('detune'))
    const baseFrequency = this.params.get('frequency')

    for (let i = 0; i < frames; i++) {
      const frequency = (frequencyIn ? (frequencyIn[i] ?? 0) : baseFrequency) * ratio
      out[i] = waveAt(shape, this.phase)
      this.phase += frequency / sampleRate
      if (this.phase >= 1) this.phase -= Math.floor(this.phase)
    }
  }
}

export const oscillatorNode: NodeDefinition = {
  type: 'oscillator',
  label: 'Oscillator',
  inputs: [{ id: 'freq', label: 'Freq' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  create: () => new Oscillator(),
}
