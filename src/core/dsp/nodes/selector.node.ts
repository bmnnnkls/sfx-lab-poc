import { Params } from '../params'
import type { DspNode, NodeDefinition, ParamSpec, ProcessContext } from '../types'

/** The most positions a selector can have: more than this is a number, not a choice. */
export const MAX_POSITIONS = 16

const PARAMS: readonly ParamSpec[] = [
  { id: 'index', label: 'Position', min: 0, max: MAX_POSITIONS - 1, default: 0, step: 1 },
  { id: 'count', label: 'Positions', min: 2, max: MAX_POSITIONS, default: 4, step: 1 },
]

/** Which of its positions is chosen, as an index from 0, kept inside the positions it has. */
export const selectedIndex = (index: number, count: number): number => {
  const last = Math.max(1, Math.round(count)) - 1
  const chosen = Math.round(index)
  return Number.isFinite(chosen) ? Math.min(last, Math.max(0, chosen)) : 0
}

/** A row of buttons as a node: it outputs the number of the chosen one (0 for the first), constant over the block. */
class Selector implements DspNode {
  private readonly params = new Params(PARAMS)

  setParam(id: string, value: number): void {
    this.params.set(id, value)
  }

  process({ frames }: ProcessContext, _inputs: ReadonlyArray<Float32Array | null>, [out]: readonly Float32Array[]): void {
    out?.fill(selectedIndex(this.params.get('index'), this.params.get('count')), 0, frames)
  }
}

export const selectorNode: NodeDefinition = {
  type: 'selector',
  label: 'Selector',
  inputs: [],
  outputs: [{ id: 'out', label: 'Out', kind: 'control' }],
  params: PARAMS,
  global: true,
  inNotes: true,
  panelKind: 'selector',
  paramSockets: false,
  create: () => new Selector(),
}
