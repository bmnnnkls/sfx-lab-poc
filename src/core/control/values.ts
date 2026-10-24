import { type ParamSpec, fromSlider, snapToStep, toSlider } from '../dsp'
const bounded = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const clampControlValue = (spec: ParamSpec, value: number): number => {
  const finite = Number.isFinite(value) ? value : spec.default
  return bounded(spec.options ? Math.round(finite) : snapToStep(spec, finite), spec.min, spec.max)
}
export const controlToNormalized = (spec: ParamSpec, value: number): number => bounded(toSlider(spec, clampControlValue(spec, value)), 0, 1)
export const controlFromNormalized = (spec: ParamSpec, position: number): number =>
  clampControlValue(spec, fromSlider(spec, bounded(Number.isFinite(position) ? position : 0, 0, 1)))
