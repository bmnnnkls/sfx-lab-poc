import { Params } from '../params'
import type { DspNode, NodeDefinition, ProcessContext } from '../types'
import { axisParams, controlValue } from './control-value'

const PARAMS = [...axisParams('x', 'X', 0.5), ...axisParams('y', 'Y', 0.5)]

/** Two controls in one: the pad's x and y positions, each with its own range. */
class XYPad implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [x, y]: readonly Float32Array[]): void {
    const p = this.params
    x?.fill(controlValue(p.get('x'), p.get('xMin'), p.get('xMax'), p.get('xStep')), 0, frames)
    y?.fill(controlValue(p.get('y'), p.get('yMin'), p.get('yMax'), p.get('yStep')), 0, frames)
  }
}

export const xyPadNode: NodeDefinition = {
  type: 'xyPad',
  label: 'XY pad',
  inputs: [],
  outputs: [
    { id: 'x', label: 'X', kind: 'control' },
    { id: 'y', label: 'Y', kind: 'control' },
  ],
  params: PARAMS,
  global: true,
  panelKind: 'xy',
  paramSockets: false,
  create: () => new XYPad(),
}
