import { type Preview, type Values, clamp } from './types'
import { wavePoints } from './waves'

const SHAPES = ['sine', 'saw', 'square', 'triangle'] as const

/** Pitch in cycles across the picture: one at the bottom of the range, eight near the top (octaves, not Hz, so it reads as pitch). */
export const cyclesForFrequency = (hz: number): number => clamp(1 + Math.log2(Math.max(20, hz) / 20) * 0.8, 1, 8)

/** The oscillator's wave at its pitch (detune included). It has no level of its own: the wave fills the height. */
export const oscillatorPreview = (values: Values): Preview => {
  const shape = SHAPES[Math.round(clamp(values.waveform ?? 0, 0, SHAPES.length - 1))] ?? 'sine'
  const hz = (values.frequency ?? 220) * 2 ** ((values.detune ?? 0) / 1200)
  return { shapes: [{ kind: 'line', points: wavePoints(shape, cyclesForFrequency(hz), 1), tone: 'main' }] }
}
