import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const MAX_DELAY_SECONDS = 2

const PARAMS: readonly ParamSpec[] = [
  { id: 'time', label: 'Time', min: 0.001, max: MAX_DELAY_SECONDS, default: 0.3, unit: 's' },
  { id: 'feedback', label: 'Feedback', min: 0, max: 0.95, default: 0.4 },
  { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.35 },
]

/** Feedback delay line with linear-interpolated reads and a dry/wet mix. */
class Delay implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly line: Float32Array
  private writeIndex = 0

  constructor(sampleRate: number) {
    this.line = new Float32Array(Math.ceil(MAX_DELAY_SECONDS * sampleRate) + 2)
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
    const size = this.line.length
    const delaySamples = this.params.get('time') * sampleRate
    const feedback = this.params.get('feedback')
    const mix = this.params.get('mix')

    for (let i = 0; i < frames; i++) {
      const readPosition = (this.writeIndex - delaySamples + size) % size
      const index = Math.floor(readPosition)
      const fraction = readPosition - index
      const delayed =
        (this.line[index] ?? 0) * (1 - fraction) + (this.line[(index + 1) % size] ?? 0) * fraction

      const x = input?.[i] ?? 0
      this.line[this.writeIndex] = x + delayed * feedback
      this.writeIndex = (this.writeIndex + 1) % size
      out[i] = x * (1 - mix) + delayed * mix
    }
  }
}

export const delayNode: NodeDefinition = {
  type: 'delay',
  label: 'Delay',
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: PARAMS,
  shared: true,
  create: (sampleRate) => new Delay(sampleRate),
}
