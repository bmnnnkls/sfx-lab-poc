import { isWideRange, paramPortId } from '../dsp'
import { addNode, connect, createNode } from './edit'
import type { ModuleLibrary } from './module-types'
import { describeNode, resolveSpec } from './node-shape'
import type { ControlDisplay, Patch } from './types'

export interface ControlForOptions {
  /** Top-left of the new control on the canvas. */
  readonly at: { readonly x: number; readonly y: number }
  /** How it is drawn on the panel; absent: a knob. */
  readonly display?: ControlDisplay
  readonly id?: string
}

/**
 * "Create knob / slider" on a socket: adds a *Control* set up from the parameter (its range, curve, step, unit and
 * default, named after it, holding its current value) and wires it into the parameter's socket, in one edit. Nothing
 * happens (the same patch) for a parameter that has no socket, is an enum, or already has a wire into it, since a second
 * wire would add to the first rather than replace the value.
 */
export const createControlFor = (
  patch: Patch,
  modules: ModuleLibrary,
  nodeId: string,
  paramId: string,
  options: ControlForOptions,
): { patch: Patch; controlId: string } | undefined => {
  const node = patch.nodes.find((candidate) => candidate.id === nodeId)
  const shape = node && describeNode(node, modules)
  const spec = shape?.params.find((candidate) => candidate.id === paramId)
  const socket = paramPortId(paramId)
  if (!node || !shape || !spec || spec.options !== undefined) return undefined
  if (!shape.inputs.some((port) => port.id === socket)) return undefined
  if (patch.connections.some((c) => c.to.node === nodeId && c.to.port === socket)) return undefined

  const live = resolveSpec(node, spec)
  const base = createNode('control', options.at.x, options.at.y)
  const control = {
    ...base,
    ...(options.id === undefined ? {} : { id: options.id }),
    name: spec.label,
    ...(live.unit === undefined ? {} : { unit: live.unit }),
    ...(options.display === undefined || options.display === 'knob' ? {} : { display: options.display }),
    params: {
      ...base.params,
      value: node.params[paramId] ?? spec.default,
      min: live.min,
      max: live.max,
      curve: live.curve === 'log' || (live.curve === undefined && isWideRange(live)) ? 1 : live.curve === 'exp' ? 2 : 0,
      step: live.step ?? 0,
      default: live.default,
    },
  }
  const added = connect(addNode(patch, control), { node: control.id, port: 'out' }, { node: nodeId, port: socket }, { modules })
  return added.connections.length === patch.connections.length ? undefined : { patch: added, controlId: control.id }
}
