import { type Point, MARGIN, MID, PREVIEW_WIDTH, clamp, round } from './types'

/** One cycle of a wave at a phase of 0..1, from -1 to 1: the shapes of the oscillator and the LFO. */
export const WAVES = {
  sine: (phase: number) => Math.sin(2 * Math.PI * phase),
  saw: (phase: number) => 2 * phase - 1,
  square: (phase: number) => (phase < 0.5 ? 1 : -1),
  triangle: (phase: number) => 1 - 4 * Math.abs(phase - 0.5),
} as const

/** A repeatable stand-in for random: the same picture every time, steps that look unrelated. */
const noise = (index: number): number => {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * A wave drawn over `cycles` cycles across the picture, `amplitude` (0..1) of the available height. `random` holds a new
 * value per cycle. Sharp edges (saw, square) are drawn as the jump they are.
 */
export const wavePoints = (shape: 'sine' | 'saw' | 'square' | 'triangle' | 'random', cycles: number, amplitude: number): Point[] => {
  const height = (MID - MARGIN) * clamp(amplitude, 0, 1)
  const points: Point[] = []
  const steps = shape === 'sine' || shape === 'triangle' ? 96 : 240
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * cycles
    const phase = t - Math.floor(t)
    const value = shape === 'random' ? noise(Math.floor(t + 1e-9)) : WAVES[shape](phase)
    points.push([round((i / steps) * PREVIEW_WIDTH), round(MID - value * height)])
  }
  return points
}
