/**
 * The arithmetic behind the knobs, faders and pads. Every position is 0..1 (the widgets know nothing about parameters;
 * the panel maps a parameter's range to a position), so all of it is plain functions that can be tested without a DOM.
 */

export const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

/** A full-range drag takes this many pixels; holding Shift makes the same drag a tenth as sensitive. */
export const DRAG_RANGE_PX = 180
const FINE = 0.1

/** New position after dragging up by `up` pixels from `start` (negative `up` is a drag down). */
export const dragPosition = (start: number, up: number, fine = false): number =>
  clamp01(start + (up / DRAG_RANGE_PX) * (fine ? FINE : 1))

/** One notch of the mouse wheel moves this far (scroll up raises the value). */
export const wheelPosition = (position: number, deltaY: number, step: number, fine = false): number =>
  clamp01(position + Math.sign(-deltaY) * step * (fine ? FINE : 1))

/** The default step of one key press; callers pass a coarser one for stepped parameters, or a snapped value would not move. */
export const DEFAULT_STEP = 0.01

/**
 * Where a key press moves a position: arrows by `step` (a tenth of it with Shift), Page keys by ten steps, Home and End
 * to the ends. `undefined` for any other key, so the caller leaves it alone.
 */
export const nudge = (position: number, key: string, step = DEFAULT_STEP, fine = false): number | undefined => {
  const unit = step * (fine ? FINE : 1)
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return clamp01(position + unit)
    case 'ArrowDown':
    case 'ArrowLeft':
      return clamp01(position - unit)
    case 'PageUp':
      return clamp01(position + unit * 10)
    case 'PageDown':
      return clamp01(position - unit * 10)
    case 'Home':
      return 0
    case 'End':
      return 1
    default:
      return undefined
  }
}

export interface PadPosition {
  readonly x: number
  readonly y: number
}

/** A pad answers the arrow keys on both axes: left and right move X, up and down move Y. Home and End move X, Page keys Y. */
export const padNudge = (pad: PadPosition, key: string, step = DEFAULT_STEP, fine = false): PadPosition | undefined => {
  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End') {
    const x = nudge(pad.x, key, step, fine)
    return x === undefined ? undefined : { x, y: pad.y }
  }
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'PageUp' || key === 'PageDown') {
    const y = nudge(pad.y, key, step, fine)
    return y === undefined ? undefined : { x: pad.x, y }
  }
  return undefined
}

export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The pad position under a pointer: X grows to the right, Y grows *upwards* (the top edge is 1). Outside the box it sticks to the edge. */
export const padPosition = (box: Box, clientX: number, clientY: number): PadPosition =>
  box.width <= 0 || box.height <= 0
    ? { x: 0, y: 0 }
    : { x: clamp01((clientX - box.left) / box.width), y: 1 - clamp01((clientY - box.top) / box.height) }

/** A slider's position under a pointer, along its own axis (a vertical one has its top at 1). */
export const trackPosition = (box: Box, clientX: number, clientY: number, vertical: boolean): number => {
  const pad = padPosition(box, clientX, clientY)
  return vertical ? pad.y : pad.x
}

/** A knob sweeps 270 degrees, from 7 o'clock to 5 o'clock: the angle in degrees clockwise from straight up. */
export const KNOB_START = -135
export const KNOB_END = 135
export const knobAngle = (position: number): number => KNOB_START + clamp01(position) * (KNOB_END - KNOB_START)

const polar = (cx: number, cy: number, radius: number, angle: number): [number, number] => {
  const radians = (angle * Math.PI) / 180
  return [cx + radius * Math.sin(radians), cy - radius * Math.cos(radians)]
}

const round = (value: number): number => Math.round(value * 100) / 100

/** An SVG arc path along a circle between two angles (degrees clockwise from up, `from` < `to`). */
export const arcPath = (cx: number, cy: number, radius: number, from: number, to: number): string => {
  const [x1, y1] = polar(cx, cy, radius, from)
  const [x2, y2] = polar(cx, cy, radius, to)
  const large = to - from > 180 ? 1 : 0
  return `M ${round(x1)} ${round(y1)} A ${radius} ${radius} 0 ${large} 1 ${round(x2)} ${round(y2)}`
}

/** The end of a knob's pointer line, from the centre out to `radius`. */
export const knobPointer = (cx: number, cy: number, radius: number, position: number): [number, number] =>
  polar(cx, cy, radius, knobAngle(position))
