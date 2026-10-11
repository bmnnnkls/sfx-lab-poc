import { type ParamSpec, isWideRange, pitchName } from '@core'

/** The `exp` curve's bend: 0 is straight, larger starts slower and ends faster (the same as the Map range node). */
const BEND = 3

/**
 * A control's own `curve` decides how it is scaled; without one, wide positive ranges (e.g. 20 Hz - 20 kHz) feel right
 * on a logarithmic slider. A log curve needs a positive range, so anything else falls back to straight.
 */
export const isLogarithmic = (spec: ParamSpec): boolean =>
  spec.min > 0 && (spec.curve === undefined ? isWideRange(spec) : spec.curve === 'log')

const isExponential = (spec: ParamSpec): boolean => spec.curve === 'exp'

/** Maps a parameter value to a 0..1 slider position. */
export const toSlider = (spec: ParamSpec, value: number): number => {
  if (isLogarithmic(spec)) {
    return Math.log(value / spec.min) / Math.log(spec.max / spec.min)
  }
  const straight = spec.max === spec.min ? 0 : (value - spec.min) / (spec.max - spec.min)
  return isExponential(spec) ? Math.log(1 + Math.min(1, Math.max(0, straight)) * (Math.exp(BEND) - 1)) / BEND : straight
}

/** Inverse of `toSlider`. */
export const fromSlider = (spec: ParamSpec, position: number): number => {
  if (isLogarithmic(spec)) return spec.min * (spec.max / spec.min) ** position
  const t = isExponential(spec) ? (Math.exp(BEND * position) - 1) / (Math.exp(BEND) - 1) : position
  return spec.min + t * (spec.max - spec.min)
}

/** Rounds to the parameter's step (e.g. whole MIDI notes), when it declares one. */
export const snapToStep = (spec: ParamSpec, value: number): number =>
  spec.step ? Math.round(value / spec.step) * spec.step : value

export const formatParam = (spec: ParamSpec, value: number): string => {
  if (spec.options) return spec.options[Math.round(value)] ?? String(value)
  if (spec.format === 'midiNote') return pitchName(Math.round(value))
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return `${value.toFixed(digits)}${spec.unit ? ` ${spec.unit}` : ''}`
}
