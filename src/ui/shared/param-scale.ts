import { type ParamSpec, fromSlider, isLogarithmic, pitchName, snapToStep, toSlider } from '@core'

// How a parameter's value maps onto a 0..1 slider position lives in core (`dsp/param-scale.ts`), since randomizing needs the same feel; the words stay here.
export { fromSlider, isLogarithmic, snapToStep, toSlider }

export const formatParam = (spec: ParamSpec, value: number): string => {
  if (spec.options) return spec.options[Math.round(value)] ?? String(value)
  if (spec.format === 'midiNote') return pitchName(Math.round(value))
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return `${value.toFixed(digits)}${spec.unit ? ` ${spec.unit}` : ''}`
}
