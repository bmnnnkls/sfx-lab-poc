import { type Preview, type Values, MID, PREVIEW_WIDTH, clamp } from './types'
import { wavePoints } from './waves'

const SHAPES = ['sine', 'triangle', 'saw', 'square', 'random'] as const

/** Rate in cycles across the picture: one for the slowest, six for the fastest, on the log scale a rate is heard on. */
export const cyclesForRate = (hz: number): number => clamp(1 + (Math.log2(Math.max(0.05, hz) / 0.05) / Math.log2(30 / 0.05)) * 5, 1, 6)

/** The LFO's shape at its rate, as tall as its depth, around a dim zero line. */
export const lfoPreview = (values: Values): Preview => {
  const shape = SHAPES[Math.round(clamp(values.shape ?? 0, 0, SHAPES.length - 1))] ?? 'sine'
  return {
    shapes: [
      { kind: 'line', points: [[0, MID], [PREVIEW_WIDTH, MID]], tone: 'dim' },
      { kind: 'line', points: wavePoints(shape, cyclesForRate(values.rate ?? 2), clamp(values.depth ?? 1, 0, 1)), tone: 'main' },
    ],
  }
}
