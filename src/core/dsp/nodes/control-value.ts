import type { ParamSpec } from '../types'

/** How a control maps its position onto its range. The engine does not use it (values are real); the knobs and sliders do. */
export const CURVE_OPTIONS = ['linear', 'log', 'exp'] as const

/** Wide bounds: a control's real range is its own `min` and `max`, the spec only keeps a stray value finite. */
const BOUND = 100000

/**
 * The parameters one axis of a control carries: its value, its range and how it is stepped. `prefix` is empty for a
 * single control and `x` / `y` for the pad, so the pad's params are `x`, `xMin`, `xMax`, ...
 */
export const axisParams = (prefix: '' | 'x' | 'y', label: string, initial: number): ParamSpec[] => {
  const id = (name: string) => (prefix === '' ? name : `${prefix}${name[0]?.toUpperCase()}${name.slice(1)}`)
  const named = (text: string) => (label === '' ? text : `${label} ${text.toLowerCase()}`)
  const range = { min: id('min'), max: id('max'), step: id('step'), curve: id('curve'), reset: id('default') }
  const unitFrom = prefix === 'y' ? ('unitY' as const) : ('unit' as const)
  return [
    { id: prefix === '' ? 'value' : prefix, label: label === '' ? 'Value' : label, min: -BOUND, max: BOUND, default: initial, range, unitFrom },
    { id: id('min'), label: named('Min'), min: -BOUND, max: BOUND, default: 0, unitFrom },
    { id: id('max'), label: named('Max'), min: -BOUND, max: BOUND, default: 1, unitFrom },
    { id: id('curve'), label: named('Curve'), min: 0, max: CURVE_OPTIONS.length - 1, default: 0, step: 1, options: CURVE_OPTIONS },
    { id: id('step'), label: named('Step'), min: 0, max: BOUND, default: 0, unitFrom },
    // What "reset" returns to; the engine ignores it.
    { id: id('default'), label: named('Default'), min: -BOUND, max: BOUND, default: initial, range, unitFrom },
  ]
}

/** A control's output: its value kept inside its range and, when it has a step, on it. Never NaN. */
export const controlValue = (value: number, min: number, max: number, step: number): number => {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  const snapped = step > 0 ? low + Math.round((value - low) / step) * step : value
  const result = Math.min(high, Math.max(low, snapped))
  return Number.isFinite(result) ? result : low
}
