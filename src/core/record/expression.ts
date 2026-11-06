import { type AutomationLane, type AutomationPoint, applyTouch, simplifyTouch } from '../automation'
import { type ExpressionControl, expressionKey } from '../midi'
import { EARLY_BEATS, type ExpressionEvent, REGION_BEATS, type TakeEvent, type TakeLoop } from './take'

/** A CC's span ends after this long without a message (touch's rule for a CC gesture). */
export const CC_SPAN_GAP_MS = 800
/**
 * A value that a message changes after this long was held, not moving: the lane steps there instead of ramping from
 * the last message. A control moving sends a message every few ms.
 */
export const HELD_AFTER_MS = 50
/** How long before the new value a held one ends: a step, as near as a lane's linear segments get. */
const STEP_BEATS = 1e-4
/** The CC always recorded, ticked or not: the mod wheel. */
export const RECORDED_MOD_WHEEL = 1
const EPSILON = 1e-9

/** One recorded value of a lane: its beat (take time, then clip beats once placed) and its normalized value. */
export interface SpanSample {
  readonly beat: number
  readonly value: number
}

/**
 * A stretch of one control a take recorded: the wheel away from the centre, pressure above 0, a CC's messages without
 * an 800 ms gap. `open`: it hadn't ended yet when it was read.
 */
export interface ExpressionSpan {
  readonly samples: readonly SpanSample[]
  readonly open: boolean
}

/** Whether ● keeps a control: the wheel, pressure, the mod wheel, and the CCs ticked under *Recorded CCs*. */
export const isRecordedExpression = (control: ExpressionControl, recordedCCs: readonly number[]): boolean =>
  typeof control === 'string' || control.cc === RECORDED_MOD_WHEEL || recordedCCs.includes(control.cc)

/** A control's value as a lane holds it, 0 to 1: the wheel's −1..1 maps onto it, the centre at 0.5. */
export const expressionLaneValue = (control: ExpressionControl, value: number): number =>
  Math.min(1, Math.max(0, control === 'pitchBend' ? (value + 1) / 2 : value))
/** A control at rest, as a lane holds it. */
export const expressionRestValue = (control: ExpressionControl): number => (control === 'pitchBend' ? 0.5 : 0)

/** The controls a take's events touched, by `expressionKey`, in the order they were first played. */
export const takeControls = (events: readonly TakeEvent[]): Map<string, ExpressionControl> => {
  const controls = new Map<string, ExpressionControl>()
  for (const event of events) if (event.kind === 'expression' && !controls.has(expressionKey(event.control))) controls.set(expressionKey(event.control), event.control)
  return controls
}

export interface SpanRange {
  readonly start: number
  readonly end?: number
  readonly early?: number
  /** Where a span of the wheel or pressure that is still open holds its last value up to: the take's end, or now. */
  readonly close?: number
  /** Now, in ms on the events' clock: a CC whose last message is less than 800 ms before it is still open. */
  readonly nowMs?: number
}

/**
 * One control's spans in a take, in order, in take time: the wheel from its first value away from 0 to the first 0 after
 * it, pressure from above 0 to 0, a CC from a message to the last before 800 ms without one (on the events' timestamps).
 * Events before `start − early` are dropped, those after it until `start` count as at `start`, as notes do, and those at
 * or after `end` are dropped. An `end` event closes the open span there, holding its value.
 */
export const expressionSpans = (events: readonly TakeEvent[], control: ExpressionControl, { start, end = Infinity, early = EARLY_BEATS, close, nowMs }: SpanRange): ExpressionSpan[] => {
  const key = expressionKey(control)
  const mine = events
    .map((event, order) => ({ event, order }))
    .filter((entry): entry is { event: ExpressionEvent; order: number } => entry.event.kind === 'expression' && expressionKey(entry.event.control) === key)
    .filter(({ event }) => event.beat >= start - early - EPSILON && event.beat < end)
    .sort((a, b) => a.event.beat - b.event.beat || a.order - b.order)
  const spans: ExpressionSpan[] = []
  const cc = typeof control !== 'string'
  let current: SpanSample[] | null = null
  let lastAt = -Infinity
  const shut = () => { if (current) spans.push({ samples: current, open: false }); current = null }
  for (const { event } of mine) {
    const beat = Math.max(start, event.beat)
    const gap = event.at - lastAt
    if (cc && current && gap >= CC_SPAN_GAP_MS) shut()
    if (event.end) {
      if (current && !cc) (current as SpanSample[]).push({ beat, value: (current as SpanSample[]).at(-1)!.value })
      shut()
      continue
    }
    lastAt = event.at
    const value = expressionLaneValue(control, event.value)
    const away = cc || (control === 'pitchBend' ? event.value !== 0 : event.value > 0)
    if (!current) { if (away) current = [{ beat, value }]; continue }
    const held = (current as SpanSample[]).at(-1)!
    if (gap > HELD_AFTER_MS && beat - STEP_BEATS > held.beat) current.push({ beat: beat - STEP_BEATS, value: held.value })
    current.push({ beat, value })
    if (!away) shut()
  }
  if (current) {
    const samples = current as SpanSample[]
    const open = cc ? nowMs !== undefined && nowMs - lastAt < CC_SPAN_GAP_MS : true
    if (!cc && close !== undefined) {
      const at = Math.min(close, end)
      if (at > samples.at(-1)!.beat + EPSILON) samples.push({ beat: at, value: samples.at(-1)!.value })
    }
    spans.push({ samples, open })
  }
  return spans
}

const lerp = (a: SpanSample, b: SpanSample, beat: number): number =>
  b.beat - a.beat <= EPSILON ? b.value : a.value + (b.value - a.value) * ((beat - a.beat) / (b.beat - a.beat))

/**
 * A span's samples in the clip or region, by the rules notes follow: without `loop`, from `start`; with it, the first
 * pass and a lead-in keep their place and later passes wrap by the length, shifted by `anchor − origin`. A span that
 * crosses a wrap is cut there into one piece per pass, in order, each holding the value at the cut.
 */
export const placeSpan = (samples: readonly SpanSample[], { start, loop }: { readonly start: number; readonly loop?: TakeLoop }): SpanSample[][] => {
  if (!loop || !(loop.length > 0)) return samples.length ? [samples.map((sample) => ({ beat: sample.beat - start, value: sample.value }))] : []
  const { anchor, length, origin = anchor } = loop
  const offset = anchor - origin
  const passOf = (beat: number) => Math.max(0, Math.floor((beat - anchor + EPSILON) / length))
  const pieces: SpanSample[][] = []
  let piece: SpanSample[] = []
  let pass = -1
  let previous: SpanSample | undefined
  for (const sample of samples) {
    const at = passOf(sample.beat)
    if (previous && at > pass) {
      for (let k = pass + 1; k <= at; k++) {
        const value = lerp(previous, sample, anchor + k * length)
        piece.push({ beat: length + offset, value })
        pieces.push(piece)
        piece = [{ beat: offset, value }]
      }
    }
    pass = at
    piece.push({ beat: pass === 0 ? sample.beat - origin : sample.beat - anchor - pass * length + offset, value: sample.value })
    previous = sample
  }
  if (piece.length) pieces.push(piece)
  return pieces
}

/**
 * A take's pieces applied to a lane in order, as touch applies its passes: each replaces the lane where it lies and
 * keeps it around, from `base` (the control at rest) where the lane has no points. A piece that would pass 2048 points
 * stops it: `applied` pieces went in, and the lane is as it was before that piece.
 */
export const applyExpression = (lane: AutomationLane, pieces: readonly (readonly SpanSample[])[], length: number, base: number): { readonly lane: AutomationLane; readonly applied: number; readonly overflow: boolean } => {
  let current = lane
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!.filter((sample) => sample.beat >= -EPSILON && sample.beat <= length + EPSILON)
    if (!piece.length) continue
    const points: AutomationPoint[] = piece.map((sample) => ({ id: '', beat: Math.min(length, Math.max(0, sample.beat)), value: Math.min(1, Math.max(0, sample.value)), interpolation: 'linear' }))
    try {
      current = applyTouch(current, simplifyTouch(points), { offset: 0, length, extent: length }, base)
    } catch {
      return { lane: current, applied: i, overflow: true }
    }
  }
  return { lane: current, applied: pieces.length, overflow: false }
}

/**
 * Pieces placed from a take's first region cut into its 64-bar regions, one list of pieces per region relative to its
 * start. A piece that crosses a split goes on in the next region, from a point at its 0 holding the value there.
 */
export const splitLanes = (pieces: readonly (readonly SpanSample[])[], every = REGION_BEATS): SpanSample[][][] => {
  const regions: SpanSample[][][] = []
  const indexOf = (beat: number) => Math.max(0, Math.floor((beat + EPSILON) / every))
  for (const piece of pieces) {
    let index = -1
    let part: SpanSample[] = []
    let previous: SpanSample | undefined
    const flush = () => { if (part.length) (regions[index] ??= []).push(part); part = [] }
    for (const sample of piece) {
      const at = indexOf(sample.beat)
      if (previous && at > index) {
        for (let k = index + 1; k <= at; k++) {
          const value = lerp(previous, sample, k * every)
          part.push({ beat: every, value })
          flush()
          index = k
          part = [{ beat: 0, value }]
        }
      }
      index = at
      part.push({ beat: sample.beat - at * every, value: sample.value })
      previous = sample
    }
    flush()
  }
  for (let i = 0; i < regions.length; i++) regions[i] ??= []
  return regions
}
