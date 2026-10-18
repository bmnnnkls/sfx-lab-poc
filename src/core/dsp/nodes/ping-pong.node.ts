import { Params } from '../params'
import { RIGHT } from '../stereo'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'
import { timeSyncParam } from './time-sync'
import { delaySeconds, delayDivisionParam, DelayTap, MAX_DELAY_SECONDS } from './delay-timing'

const PARAMS: readonly ParamSpec[] = [
  // In seconds, or in beats when Sync is `beat`; so no fixed unit is shown.
  { id: 'time', label: 'Time', min: 0.001, max: 2, default: 0.3 },
  { id: 'feedback', label: 'Feedback', min: 0, max: 0.95, default: 0.5 },
  { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.35 },
  timeSyncParam,
  delayDivisionParam,
]

/**
 * A delay whose echoes bounce between the channels: the input enters the left line, each line feeds the other, so a
 * single sound comes back left, right, left, right. The dry signal keeps its own channels.
 */
class PingPong implements DspNode {
  private readonly params = new Params(PARAMS)
  private readonly left: Float32Array
  private readonly right: Float32Array
  private writeIndex = 0
  private readonly tap: DelayTap

  constructor(sampleRate: number) {
    this.tap = new DelayTap(sampleRate)
    const length = Math.ceil(MAX_DELAY_SECONDS * sampleRate) + 2
    this.left = new Float32Array(length)
    this.right = new Float32Array(length)
  }

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process(context: ProcessContext, [input]: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    if (!out) return
    const { frames, sampleRate } = context
    const size = this.left.length
    const delaySamples = delaySeconds(this.params.values, context) * sampleRate
    const feedback = this.params.get('feedback')
    const mix = this.params.get('mix')

    for (let i = 0; i < frames; i++) {
      this.tap.prepare(delaySamples)
      const echoLeft = this.tap.read(this.left, this.writeIndex)
      const echoRight = this.tap.read(this.right, this.writeIndex)
      this.tap.advance()

      const dryLeft = input?.[i] ?? 0
      const dryRight = input?.[RIGHT + i] ?? 0
      this.left[this.writeIndex] = (dryLeft + dryRight) * 0.5 + echoRight * feedback
      this.right[this.writeIndex] = echoLeft * feedback
      this.writeIndex = (this.writeIndex + 1) % size

      out[i] = dryLeft * (1 - mix) + echoLeft * mix
      out[RIGHT + i] = dryRight * (1 - mix) + echoRight * mix
    }
  }
}

export const pingPongNode: NodeDefinition = {
  type: 'pingPong',
  label: 'Ping-pong delay',
  inputs: [{ id: 'in', label: 'In', kind: 'stereo' }],
  outputs: [{ id: 'out', label: 'Out', kind: 'stereo' }],
  params: PARAMS,
  shared: true,
  insertOnly: true,
  create: (sampleRate) => new PingPong(sampleRate),
}
