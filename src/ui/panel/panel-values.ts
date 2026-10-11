import {
  type ControlSize,
  type PanelControl,
  type ParamBinding,
  type ParamSpec,
  type Patch,
} from '@core'
import { clamp01 } from '../controls/control-math'
import { formatParam, fromSlider, isLogarithmic, snapToStep, toSlider } from '../shared/param-scale'

/** The arithmetic between a parameter's value and a control's 0..1 position, and how a control is laid out. Pure, so it is tested without a DOM. */

export const positionOf = (spec: ParamSpec, value: number): number => clamp01(toSlider(spec, value))

/** The value a position stands for: on the parameter's own scale (log for wide ranges), on its step, inside its range. */
export const valueAt = (spec: ParamSpec, position: number): number =>
  Math.min(spec.max, Math.max(spec.min, snapToStep(spec, fromSlider(spec, clamp01(position)))))

export const defaultPosition = (spec: ParamSpec): number => positionOf(spec, spec.default)

/** One arrow key or wheel notch, as a fraction of the range: a whole step for stepped linear parameters, else 1%. */
export const keyStep = (spec: ParamSpec): number =>
  spec.step !== undefined && spec.step > 0 && !isLogarithmic(spec) && spec.max > spec.min
    ? Math.min(0.25, spec.step / (spec.max - spec.min))
    : 0.01

/** What the node holds for the parameter, or the parameter's default when it holds nothing. */
export const valueOf = (patch: Patch, binding: ParamBinding, spec: ParamSpec): number =>
  patch.nodes.find((node) => node.id === binding.node)?.params[binding.param] ?? spec.default

export const readValue = (spec: ParamSpec, value: number): string => formatParam(spec, value)

export interface Span {
  readonly cols: number
  readonly rows: number
}

const STEP: Record<ControlSize, number> = { S: 0, M: 1, L: 2 }

/** Grid cells a control takes. A knob grows square, a slider along its length, a pad wide; a selector widens for many options. */
export const spanOf = (control: PanelControl, optionCount = 0): Span => {
  const step = STEP[control.size]
  switch (control.kind) {
    case 'knob':
      return { cols: step + 1, rows: step + 1 }
    case 'slider':
      return control.orientation === 'horizontal' ? { cols: step + 2, rows: 1 } : { cols: 1, rows: step + 2 }
    case 'xy':
      return control.size === 'S' ? { cols: 2, rows: 2 } : control.size === 'M' ? { cols: 3, rows: 2 } : { cols: 3, rows: 3 }
    case 'selector':
      return { cols: optionCount > 3 ? 2 : 1, rows: 1 }
  }
}

/** The widest a knob may draw, in px, for its size. */
export const knobWidth = (size: ControlSize): number => (size === 'S' ? 64 : size === 'M' ? 112 : 160)
