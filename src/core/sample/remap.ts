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

/**
 * One edit's position map as data: a few numbers, saved on the sample (`SampleInfo.lineage`) so a chain of edits can be
 * run backwards. `mapOf` is the only way to a `FrameMap`, so a map and its data can't disagree.
 */
export type RemapStep =
  /** `from` up to `to` is replaced by `inserted` frames: a delete (none), an insert (`from == to`) or a paste over a range. */
  | { readonly kind: 'splice'; readonly from: number; readonly to: number; readonly inserted: number }
  /** Only `from` up to `to` is kept: a crop. */
  | { readonly kind: 'crop'; readonly from: number; readonly to: number }
  /** `from` up to `to` plays backwards: a reverse of every channel. */
  | { readonly kind: 'mirror'; readonly from: number; readonly to: number }

/** A `FrameMap` with the sample's length before and after the edit, and the steps it is made of, for `replaceSample`. */
export interface SampleRemap extends FrameMap {
  readonly fromFrames: number
  readonly toFrames: number
  /** The steps this map runs, in order; none for the identity. An in-place edit appends them to the sample's lineage. */
  readonly steps: readonly RemapStep[]
}

const kept = (range: FrameRange): FrameRange | null => (range.to > range.from ? range : null)

/** Nothing moves: a process that keeps the length. */
export const identityMap: FrameMap = {
  identity: true,
  frame: (position) => position,
  start: (position) => position,
  range: (range) => kept(range),
}

const spliceMap = ({ from, to, inserted }: Extract<RemapStep, { kind: 'splice' }>): FrameMap => {
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

const cropMap = ({ from, to }: Extract<RemapStep, { kind: 'crop' }>): FrameMap => {
  const clip = (position: number) => Math.min(to, Math.max(from, position)) - from
  return {
    identity: false,
    frame: (position) => (position < from || position > to ? null : position - from),
    start: clip,
    range: (range) => kept({ from: clip(range.from), to: clip(range.to) }),
  }
}

/** Positions inside the stretch mirror; a range keeps its ends in order. */
const mirrorMap = ({ from, to }: Extract<RemapStep, { kind: 'mirror' }>): FrameMap => {
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

/** The `FrameMap` a step is; none is the identity. */
export const mapOf = (step: RemapStep | null): FrameMap => {
  if (!step) return identityMap
  switch (step.kind) {
    case 'splice':
      return spliceMap(step)
    case 'crop':
      return cropMap(step)
    case 'mirror':
      return mirrorMap(step)
  }
}

/**
 * The step that undoes `step`'s moves, for positions that exist in both versions: a splice's is the splice back, a
 * crop's is a shift (a splice at 0 that puts the cropped-off start back), a mirror is its own. Positions only the later
 * version has (inserted or pasted audio) map as any splice maps audio that is gone.
 */
export const inverseStep = (step: RemapStep): RemapStep => {
  switch (step.kind) {
    case 'splice':
      return { kind: 'splice', from: step.from, to: step.from + step.inserted, inserted: step.to - step.from }
    case 'crop':
      return { kind: 'splice', from: 0, to: 0, inserted: step.from }
    case 'mirror':
      return step
  }
}

/** The maps one after another: a position gone in one is gone. */
export const composeMaps = (maps: readonly FrameMap[]): FrameMap => {
  if (maps.length === 1) return maps[0]!
  return {
    identity: maps.every((map) => map.identity),
    frame: (position) => maps.reduce<number | null>((at, map) => (at === null ? null : map.frame(at)), position),
    start: (position) => maps.reduce((at, map) => map.start(at), position),
    range: (range) => maps.reduce<FrameRange | null>((at, map) => (at === null ? null : map.range(at)), range),
  }
}

/** A `SampleRemap` running `steps` in order, from a sample of `fromFrames` frames to one of `toFrames`. */
export const remapOfSteps = (steps: readonly RemapStep[], fromFrames: number, toFrames: number): SampleRemap => ({
  ...composeMaps(steps.length === 0 ? [identityMap] : steps.map(mapOf)),
  fromFrames,
  toFrames,
  steps,
})
