import { type ParamSpec, pitchName } from '@core'

/** Wide positive ranges (e.g. 20 Hz - 20 kHz) feel right on a logarithmic slider. */
const isLogarithmic = (spec: ParamSpec): boolean => spec.min > 0 && spec.max / spec.min >= 50

/** Maps a parameter value to a 0..1 slider position. */
export const toSlider = (spec: ParamSpec, value: number): number => {
  if (isLogarithmic(spec)) {
    return Math.log(value / spec.min) / Math.log(spec.max / spec.min)
  }
  return (value - spec.min) / (spec.max - spec.min)
}

/** Inverse of `toSlider`. */
export const fromSlider = (spec: ParamSpec, position: number): number => {
  if (isLogarithmic(spec)) return spec.min * (spec.max / spec.min) ** position
  return spec.min + position * (spec.max - spec.min)
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
