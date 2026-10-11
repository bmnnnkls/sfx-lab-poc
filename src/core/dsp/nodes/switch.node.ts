import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

const PARAMS: readonly ParamSpec[] = [
  { id: 'on', label: 'On', min: 0, max: 1, default: 0, step: 1 },
  // How the panel treats a press: a toggle stays where it is put, a momentary switch is on only while held.
  { id: 'mode', label: 'Mode', min: 0, max: 1, default: 0, step: 1, options: ['toggle', 'momentary'] },
]

/** A switch as a node: outputs 1 while it is on and 0 while it is off. */
class Switch implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    out?.fill(this.params.get('on') >= 0.5 ? 1 : 0, 0, frames)
  }
}

export const switchNode: NodeDefinition = {
  type: 'switch',
  label: 'Switch',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out', kind: 'control' }],
  params: PARAMS,
  global: true,
  paramSockets: false,
  create: () => new Switch(),
}
