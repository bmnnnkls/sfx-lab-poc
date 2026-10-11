import { isWideRange, paramPortId } from '../dsp'
import { addNode, connect, createNode } from './edit'
import type { ModuleLibrary } from './module-types'
import { describeNode, resolveSpec } from './node-shape'
import type { ControlDisplay, Patch, PatchNode, PortRef } from './types'

export interface ControlForOptions {
  /** Top-left of the new control on the canvas. */
  readonly at: { readonly x: number; readonly y: number }
  /** How it is drawn on the panel; absent: a knob. */
  readonly display?: ControlDisplay
  readonly id?: string
}

/** A parameter that a control can be made for: it has a socket, is not an enum and nothing is wired into it yet. */
const eligible = (patch: Patch, modules: ModuleLibrary, ref: PortRef) => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  const shape = node && describeNode(node, modules)
  const spec = shape?.params.find((candidate) => candidate.id === ref.port)
  const socket = paramPortId(ref.port)
  if (!node || !shape || !spec || spec.options !== undefined) return undefined
  if (!shape.inputs.some((port) => port.id === socket)) return undefined
  if (patch.connections.some((c) => c.to.node === ref.node && c.to.port === socket)) return undefined
  return { node, spec: resolveSpec(node, spec), stored: node.params[ref.port] ?? spec.default, socket }
}

/** The value, range, curve, step and default a control takes from the parameter it will drive. */
const fieldsOf = (target: NonNullable<ReturnType<typeof eligible>>) => {
  const { spec, stored } = target
  return {
    value: stored,
    min: spec.min,
    max: spec.max,
    curve: spec.curve === 'log' || (spec.curve === undefined && isWideRange(spec)) ? 1 : spec.curve === 'exp' ? 2 : 0,
    step: spec.step ?? 0,
    default: spec.default,
  }
}

const prefixed = (fields: ReturnType<typeof fieldsOf>, axis: 'x' | 'y') => ({
  [axis]: fields.value,
  [`${axis}Min`]: fields.min,
  [`${axis}Max`]: fields.max,
  [`${axis}Curve`]: fields.curve,
  [`${axis}Step`]: fields.step,
  [`${axis}Default`]: fields.default,
})

/**
 * "Create knob / slider" on a socket: adds a *Control* set up from the parameter (its range, curve, step, unit and
 * default, named after it, holding its current value) and wires it into the parameter's socket, in one edit. Nothing
 * happens (undefined) for a parameter that has no socket, is an enum, or already has a wire into it, since a second
 * wire would add to the first rather than replace the value.
 */
export const createControlFor = (
  patch: Patch,
  modules: ModuleLibrary,
  nodeId: string,
  paramId: string,
  options: ControlForOptions,
): { patch: Patch; controlId: string } | undefined => {
  const target = eligible(patch, modules, { node: nodeId, port: paramId })
  if (!target) return undefined
  const base = createNode('control', options.at.x, options.at.y)
  const control: PatchNode = {
    ...base,
    ...(options.id === undefined ? {} : { id: options.id }),
    name: target.spec.label,
    ...(target.spec.unit === undefined ? {} : { unit: target.spec.unit }),
    ...(options.display === undefined || options.display === 'knob' ? {} : { display: options.display }),
    params: { ...base.params, ...fieldsOf(target) },
  }
  const added = connect(addNode(patch, control), { node: control.id, port: 'out' }, { node: nodeId, port: target.socket }, { modules })
  return added.connections.length === patch.connections.length ? undefined : { patch: added, controlId: control.id }
}

/**
 * An XY pad for two parameters: its x and y take their ranges, curves, units and current values, and each output is
 * wired into its parameter's socket, in one edit. Undefined when either parameter would be refused by `createControlFor`,
 * or they are the same one.
 */
export const createXyFor = (
  patch: Patch,
  modules: ModuleLibrary,
  x: PortRef,
  y: PortRef,
  options: { readonly at: { readonly x: number; readonly y: number }; readonly id?: string },
): { patch: Patch; controlId: string } | undefined => {
  if (x.node === y.node && x.port === y.port) return undefined
  const first = eligible(patch, modules, x)
  const second = eligible(patch, modules, y)
  if (!first || !second) return undefined
  const base = createNode('xyPad', options.at.x, options.at.y)
  const pad: PatchNode = {
    ...base,
    ...(options.id === undefined ? {} : { id: options.id }),
    name: `${first.spec.label} / ${second.spec.label}`.slice(0, 60),
    ...(first.spec.unit === undefined ? {} : { unit: first.spec.unit }),
    ...(second.spec.unit === undefined ? {} : { unitY: second.spec.unit }),
    params: { ...base.params, ...prefixed(fieldsOf(first), 'x'), ...prefixed(fieldsOf(second), 'y') },
  }
  let next = connect(addNode(patch, pad), { node: pad.id, port: 'x' }, { node: x.node, port: first.socket }, { modules })
  next = connect(next, { node: pad.id, port: 'y' }, { node: y.node, port: second.socket }, { modules })
  return next.connections.length === patch.connections.length + 2 ? { patch: next, controlId: pad.id } : undefined
}

/** A control with nothing wired to it, for the panel's "add" tools: wire it to something in the graph afterwards. */
export const createBlankControl = (
  patch: Patch,
  kind: 'knob' | 'slider' | 'slider-horizontal' | 'xy' | 'switch' | 'selector',
  at: { readonly x: number; readonly y: number },
): { patch: Patch; controlId: string } => {
  const base = createNode(kind === 'xy' ? 'xyPad' : kind === 'switch' ? 'switch' : kind === 'selector' ? 'selector' : 'control', at.x, at.y)
  const node: PatchNode = { ...base, ...(kind === 'slider' || kind === 'slider-horizontal' ? { display: kind } : {}) }
  return { patch: addNode(patch, node), controlId: node.id }
}
