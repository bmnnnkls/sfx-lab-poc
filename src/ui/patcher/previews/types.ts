/** The drawing area of a picture on a card, in SVG units (a card is 176 wide; the picture sits inside its padding). */
export const PREVIEW_WIDTH = 152
export const PREVIEW_HEIGHT = 36

export type Point = readonly [number, number]

/** `main` is what the node does; `dim` is a reference (an axis, a ceiling). */
export type Tone = 'main' | 'dim'

export type Shape =
  | { readonly kind: 'line'; readonly points: readonly Point[]; readonly tone: Tone }
  /** A filled outline: the points, closed down to `baseline`. */
  | { readonly kind: 'area'; readonly points: readonly Point[]; readonly baseline: number; readonly tone: Tone }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly tone: Tone; readonly filled: boolean }
  | { readonly kind: 'dot'; readonly x: number; readonly y: number; readonly tone: Tone }

/** A picture of what a node does, as plain shapes: tested without a DOM, drawn by `NodePreview`. */
export interface Preview {
  readonly shapes: readonly Shape[]
}

/** The numbers a node is working with (`resolveParams`), by parameter id. */
export type Values = Readonly<Record<string, number>>

export const MID = PREVIEW_HEIGHT / 2
/** Room kept at the top and bottom so a stroke at the extreme is not clipped. */
export const MARGIN = 3

/** Holds a value inside a range; a number that is not a number (NaN) is the low end, so a picture never has a missing coordinate. */
export const clamp = (value: number, low: number, high: number): number => (Number.isNaN(value) ? low : Math.min(high, Math.max(low, value)))
export const round = (value: number): number => Math.round(value * 100) / 100
