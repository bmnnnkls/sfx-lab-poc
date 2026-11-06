import { type ParamSpec, ccLabel, fromSlider, isLogarithmic, pitchName, snapToStep, toSlider } from '@core'

// How a parameter's value maps onto a 0..1 slider position lives in core (`dsp/param-scale.ts`), since randomizing needs the same feel; the words stay here.
export { fromSlider, isLogarithmic, snapToStep, toSlider }

/** A MIDI value 0 to 1 as the 0 to 127 a controller sends. */
const MIDI_STEPS = 127

/**
 * The number a person reads and types for a value: a bend in semitones at its range, pressure and a CC 0 to 127, any
 * other value as it is.
 */
export const displayValue = (spec: ParamSpec, value: number): number =>
  spec.format === 'bend' ? value * (spec.displayScale ?? 1) : spec.format === 'midi7' ? Math.round(value * MIDI_STEPS) : value
/** The value of a typed number, the inverse of `displayValue` (a bend range of 0 reads every number as rest). */
export const fromDisplayValue = (spec: ParamSpec, shown: number): number =>
  spec.format === 'bend' ? (spec.displayScale ? shown / spec.displayScale : 0) : spec.format === 'midi7' ? shown / MIDI_STEPS : shown

export const formatParam = (spec: ParamSpec, value: number): string => {
  if (spec.options) return spec.options[Math.round(value)] ?? String(value)
  if (spec.format === 'midiNote') return pitchName(Math.round(value))
  if (spec.format === 'midiCC') return ccLabel(Math.round(value))
  if (spec.format === 'midi7') return String(displayValue(spec, value))
  if (spec.format === 'bend') {
    const semitones = displayValue(spec, value)
    return !spec.displayScale ? '±0' : `${semitones > 0 ? '+' : semitones < 0 ? '−' : '±'}${Math.abs(semitones).toFixed(2)} st`
  }
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return `${value.toFixed(digits)}${spec.unit ? ` ${spec.unit}` : ''}`
}
