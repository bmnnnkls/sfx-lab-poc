import { Params } from '../params'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'
import { axisParams, controlValue } from './control-value'

const PARAMS = axisParams('', '', 0.5)

/** A knob or slider as a node: it outputs its value, constant over the block. The value is real (in its own range). */
class Control implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    const p = this.params
    out?.fill(controlValue(p.get('value'), p.get('min'), p.get('max'), p.get('step')), 0, frames)
  }
}

export const controlNode: NodeDefinition = {
  type: 'control',
  label: 'Control',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out', kind: 'control' }],
  params: PARAMS,
  global: true,
  paramSockets: false,
  create: () => new Control(),
}
