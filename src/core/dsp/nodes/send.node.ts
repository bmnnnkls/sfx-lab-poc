import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

export const SEND_TYPE = 'send'

const PARAMS: readonly ParamSpec[] = [{ id: 'amount', label: 'Amount', min: 0, max: 1, default: 1, step: 0.01 }]

/**
 * Adds the signal, times Amount, to a return track, and ends here: nothing continues from a Send, so put it beside the
 * path that carries on (a wire may feed any number of inputs). Wherever it sits in the graph is where the signal is
 * taken, before or after other effects. With no return chosen it does nothing.
 */
class Send implements DspNode {
  private readonly params = new Params(PARAMS)
  private trackId: string | null = null

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  setTrack(trackId: string | null): void {
    this.trackId = trackId
  }

  process({ frames, sends }: ProcessContext, [input]: ReadonlyArray<Float32Array | null>): void {
    if (this.trackId !== null && input) sends?.add(this.trackId, input, this.params.get('amount'), frames)
  }
}

export const sendNode: NodeDefinition = {
  type: SEND_TYPE,
  label: 'Send',
  inputs: [{ id: 'in', label: 'In', kind: 'stereo' }],
  outputs: [],
  params: PARAMS,
  insertOnly: true,
  usesTrack: 'return',
  create: () => new Send(),
}
