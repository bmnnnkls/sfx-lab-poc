import { type ControlSize, type NodeShape, type PanelItem, type ParamSpec, type PatchNode, resolveSpec } from '@core'
import { clamp01 } from '../controls/control-math'
import { formatParam, fromSlider, isLogarithmic, snapToStep, toSlider } from '../shared/param-scale'

/** The arithmetic between a parameter's value and a control's 0..1 position, and how a control is laid out. Pure, so it is tested without a DOM. */

export const positionOf = (spec: ParamSpec, value: number): number => clamp01(toSlider(spec, value))

/** The value a position stands for: on the parameter's own scale (a control's curve, or log for wide ranges), on its step, inside its range. */
export const valueAt = (spec: ParamSpec, position: number): number =>
  Math.min(spec.max, Math.max(spec.min, snapToStep(spec, fromSlider(spec, clamp01(position)))))

export const defaultPosition = (spec: ParamSpec): number => positionOf(spec, spec.default)

/** One arrow key or wheel notch, as a fraction of the range: a whole step for stepped linear parameters, else 1%. */
export const keyStep = (spec: ParamSpec): number =>
  spec.step !== undefined && spec.step > 0 && !isLogarithmic(spec) && spec.max > spec.min
    ? Math.min(0.25, spec.step / (spec.max - spec.min))
    : 0.01

export const readValue = (spec: ParamSpec, value: number): string => formatParam(spec, value)

/**
 * One axis of a control node as the board uses it: its live range, curve and unit (`resolveSpec`), with its own `default`
 * as the value a double-click returns to. `undefined` when the node does not have the parameter.
 */
export const axisSpec = (node: PatchNode, shape: NodeShape, paramId: string): ParamSpec | undefined => {
  const spec = shape.params.find((candidate) => candidate.id === paramId)
  if (!spec) return undefined
  const resolved = resolveSpec(node, spec)
  const reset = resolved.range?.reset === undefined ? undefined : node.params[resolved.range.reset]
  return reset === undefined ? resolved : { ...resolved, default: reset }
}

export interface Span {
  readonly cols: number
  readonly rows: number
}

const STEP: Record<ControlSize, number> = { S: 0, M: 1, L: 2 }

/** Grid cells a control takes. A knob grows square, a slider along its length, a pad wide; a switch is one cell and a selector a short row. */
export const spanOf = (item: Pick<PanelItem, 'kind' | 'size' | 'horizontal'>): Span => {
  const step = STEP[item.size]
  switch (item.kind) {
    case 'knob':
      return { cols: step + 1, rows: step + 1 }
    case 'slider':
      return item.horizontal ? { cols: step + 2, rows: 1 } : { cols: 1, rows: step + 2 }
    case 'xy':
      return item.size === 'S' ? { cols: 2, rows: 2 } : item.size === 'M' ? { cols: 3, rows: 2 } : { cols: 3, rows: 3 }
    case 'switch':
      return { cols: step + 1, rows: 1 }
    case 'selector':
      return { cols: step + 2, rows: 1 }
    case 'led':
      return { cols: step + 1, rows: 1 }
    case 'display':
    case 'bar':
      return { cols: step + 2, rows: 1 }
  }
}

/** The widest a knob may draw, in px, for its size. */
export const knobWidth = (size: ControlSize): number => (size === 'S' ? 64 : size === 'M' ? 112 : 160)
