import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'
import { timeSyncParam } from './time-sync'
import { delaySeconds, delayDivisionParam, DelayTap, MAX_DELAY_SECONDS } from './delay-timing'

const PARAMS: readonly ParamSpec[] = [
  // In seconds, or in beats when Sync is `beat`; so no fixed unit is shown.
  { id: 'time', label: 'Time', min: 0.001, max: 2, default: 0.3 },
  { id: 'feedback', label: 'Feedback', min: 0, max: 0.95, default: 0.4 },
  { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.35 },
  timeSyncParam,
  delayDivisionParam,
]

/** Feedback delay line with linear-interpolated reads and a dry/wet mix. */
class Delay implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly line: Float32Array
  private writeIndex = 0
  private readonly tap: DelayTap

  constructor(sampleRate: number) {
    this.tap = new DelayTap(sampleRate)
    this.line = new Float32Array(Math.ceil(MAX_DELAY_SECONDS * sampleRate) + 2)
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(
    context: ProcessContext,
    [input]: ReadonlyArray<Float32Array | null>,
    [out]: readonly Float32Array[],
  ): void {
    if (!out) return
    const { frames, sampleRate } = context
    const size = this.line.length
    const delaySamples = delaySeconds(this.params.values, context) * sampleRate
    const feedback = this.params.get('feedback')
    const mix = this.params.get('mix')

    for (let i = 0; i < frames; i++) {
      this.tap.prepare(delaySamples)
      const delayed = this.tap.read(this.line, this.writeIndex)
      this.tap.advance()

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
  stereoCapable: true,
  create: (sampleRate) => new Delay(sampleRate),
}
