import { type Point, type Preview, type Values, MARGIN, PREVIEW_HEIGHT, PREVIEW_WIDTH, clamp, round } from './types'

/** How long the held part of the shape is drawn, in the same square-root units as the times (a key held for a while). */
const HOLD = 0.5

/**
 * The ADSR shape. Times are drawn on a square-root scale so a 10 ms attack and a 2 s release can both be seen; the
 * sustain is a short flat stretch, and the dim line is full level.
 */
export const envelopePreview = (values: Values): Preview => {
  const attack = Math.sqrt(clamp(values.attack ?? 0.01, 0.001, 4))
  const decay = Math.sqrt(clamp(values.decay ?? 0.15, 0.001, 4))
  const release = Math.sqrt(clamp(values.release ?? 0.25, 0.001, 6))
  const sustain = clamp(values.sustain ?? 0.6, 0, 1)
  const total = attack + decay + HOLD + release
  const left = 2
  const scale = (PREVIEW_WIDTH - 2 * left) / total
  const top = MARGIN
  const bottom = PREVIEW_HEIGHT - MARGIN
  const y = (level: number) => round(bottom - level * (bottom - top))
  const points: Point[] = [
    [left, y(0)],
    [round(left + attack * scale), y(1)],
    [round(left + (attack + decay) * scale), y(sustain)],
    [round(left + (attack + decay + HOLD) * scale), y(sustain)],
    [round(left + total * scale), y(0)],
  ]
  return {
    shapes: [
      { kind: 'line', points: [[0, y(1)], [PREVIEW_WIDTH, y(1)]], tone: 'dim' },
      { kind: 'area', points, baseline: y(0), tone: 'main' },
    ],
  }
}
