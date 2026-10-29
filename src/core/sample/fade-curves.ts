/**
 * The shapes of fades and crossfades: `g(t)` for `t` from 0 to 1, rising from 0 to 1. A fade out uses `g(1 − t)`. The
 * toolbar's curve menu is built from `FADE_CURVES`; adding or dropping a curve is one row.
 */

export type FadeCurve = 'linear' | 'equal-power' | 'slow-start' | 'fast-start' | 's-curve'

export interface FadeCurveEntry {
  readonly curve: FadeCurve
  readonly title: string
  readonly g: (t: number) => number
}

export const FADE_CURVES: readonly FadeCurveEntry[] = [
  { curve: 'linear', title: 'Linear', g: (t) => t },
  { curve: 'equal-power', title: 'Equal power', g: (t) => Math.sin((Math.PI * t) / 2) },
  { curve: 'slow-start', title: 'Slow start', g: (t) => t * t * t },
  { curve: 'fast-start', title: 'Fast start', g: (t) => 1 - (1 - t) ** 3 },
  { curve: 's-curve', title: 'S-curve', g: (t) => (1 - Math.cos(Math.PI * t)) / 2 },
]

/** The curves a crossfade (and an edge ramp) may take: equal gain, for the same material on both sides, or equal power. */
export type CrossfadeCurve = Extract<FadeCurve, 'linear' | 'equal-power'>
export const CROSSFADE_CURVES: readonly CrossfadeCurve[] = ['linear', 'equal-power']

/** The curve's shape; an unknown name is linear. */
export const fadeShape = (curve: FadeCurve): ((t: number) => number) =>
  (FADE_CURVES.find((entry) => entry.curve === curve) ?? FADE_CURVES[0]!).g

export const isFadeCurve = (value: unknown): value is FadeCurve => FADE_CURVES.some((entry) => entry.curve === value)
export const isCrossfadeCurve = (value: unknown): value is CrossfadeCurve => CROSSFADE_CURVES.includes(value as CrossfadeCurve)
