/**
 * Where the frames of a sample are after an edit. Markers, regions and audio clips' trims all go through this, so what
 * an edit does to them is decided once per edit kind (in `SAMPLE_EDITS`), from three shapes: nothing moves, a stretch is
 * replaced by another of some length (delete, insert, paste), only a stretch is kept (crop), or a stretch is mirrored
 * (reverse).
 *
 * Positions are frame boundaries, 0 to the length: a marker at the last frame is at `length`, a range's `to` is the
 * first frame after it. They may be fractional (a trim is a fraction of the length).
 */

/** A stretch of a sample in frames, from `from` up to (not including) `to`. */
export interface FrameRange {
  readonly from: number
  readonly to: number
}

/** How one edit moves positions. */
export interface FrameMap {
  /** True when every position stays where it was. */
  readonly identity: boolean
  /** Where a position is now, or null when the audio at it is gone. */
  frame(position: number): number | null
  /** Where a range's start is now, moved forward past audio that is gone. */
  start(position: number): number
  /** A range's start mapped forward and its end backward, or null when nothing of it is left. */
  range(range: FrameRange): FrameRange | null
}

/** A `FrameMap` with the sample's length before and after the edit, for `replaceSample`. */
export interface SampleRemap extends FrameMap {
  readonly fromFrames: number
  readonly toFrames: number
}

const kept = (range: FrameRange): FrameRange | null => (range.to > range.from ? range : null)

/** Nothing moves: a process that keeps the length. */
export const identityMap: FrameMap = {
  identity: true,
  frame: (position) => position,
  start: (position) => position,
  range: (range) => kept(range),
}

/** `from` up to `to` is replaced by `inserted` frames: a delete (none), an insert (`from == to`) or a paste over a range. */
export const spliceMap = (from: number, to: number, inserted: number): FrameMap => {
  const shift = inserted - (to - from)
  const start = (position: number) => (position < from ? position : position >= to ? position + shift : from + inserted)
  const end = (position: number) => (position <= from ? position : position >= to ? position + shift : from)
  return {
    identity: shift === 0 && inserted === 0,
    frame: (position) => (position < from || position >= to ? start(position) : null),
    start,
    range: (range) => kept({ from: start(range.from), to: end(range.to) }),
  }
}

/** Only `from` up to `to` is kept: a crop. */
export const cropMap = (from: number, to: number): FrameMap => {
  const clip = (position: number) => Math.min(to, Math.max(from, position)) - from
  return {
    identity: false,
    frame: (position) => (position < from || position > to ? null : position - from),
    start: clip,
    range: (range) => kept({ from: clip(range.from), to: clip(range.to) }),
  }
}

/** `from` up to `to` plays backwards: positions inside it mirror; a range keeps its ends in order. */
export const mirrorMap = (from: number, to: number): FrameMap => {
  const mirror = (position: number) => (position >= from && position <= to ? from + to - position : position)
  return {
    identity: false,
    frame: mirror,
    start: mirror,
    range: (range) => {
      const [a, b] = [mirror(range.from), mirror(range.to)]
      return kept({ from: Math.min(a, b), to: Math.max(a, b) })
    },
  }
}
