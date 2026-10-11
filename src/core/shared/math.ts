export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const midiToFrequency = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12)

export const centsToRatio = (cents: number): number => 2 ** (cents / 1200)
