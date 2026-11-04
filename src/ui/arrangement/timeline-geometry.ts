import { BEATS_PER_BAR } from './timeline-constants'
import type { Axis } from '../shared/timeline'

/** The ruler's label steps, in beats: sixteenths up to 512 bars, so a whole 4096-beat timeline can be labelled. */
export const TIMELINE_BEAT_STEPS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]

/** A ruler label: the bar alone on a bar line, else bar, beat and sixteenth (`5.2.3`). */
export const beatLabel = (beats: number, formatBeat: (beats: number) => string): string =>
  Number.isInteger(beats / BEATS_PER_BAR) ? String(beats / BEATS_PER_BAR + 1) : formatBeat(beats)

/** The arrangement's axis, in beats, from its scroller: the timeline starts after the header column. */
export const timelineAxis = (scrollLeft: number, visibleWidth: number, pxPerBeat: number): Axis => ({
  start: scrollLeft / pxPerBeat,
  perPixel: 1 / pxPerBeat,
  width: Math.max(1, visibleWidth),
})

/** Grid lines closer than this are not drawn. */
const MIN_LINE_PX = 4

/**
 * How far apart the lanes' lines are, in pixels: bar lines, every fourth bar when bars are too close; grid lines at the
 * grid's step, or none (the bar spacing) when the grid is off or too close.
 */
export const gridSpacing = (pxPerBeat: number, gridBeats: number | null): { readonly barPx: number; readonly gridPx: number } => {
  let barPx = BEATS_PER_BAR * pxPerBeat
  while (barPx < MIN_LINE_PX) barPx *= 4
  const gridPx = gridBeats !== null && gridBeats * pxPerBeat >= MIN_LINE_PX ? gridBeats * pxPerBeat : barPx
  return { barPx, gridPx }
}

/** How far in from the left a followed playhead sits after a jump, as a share of the visible width (the piano roll's). */
const FOLLOW_INSET = 0.15
/** The playhead counts as leaving on the right this many pixels before the edge. */
const FOLLOW_MARGIN_PX = 24

/**
 * Where follow scrolls to for a playhead at content x `x`: nowhere (null) while it is in view, else so it sits 15% in.
 * `scrollLeft` and `width` are the visible timeline's.
 */
export const followScroll = (x: number, scrollLeft: number, width: number): number | null =>
  x >= scrollLeft && x <= scrollLeft + width - FOLLOW_MARGIN_PX ? null : Math.max(0, x - width * FOLLOW_INSET)
