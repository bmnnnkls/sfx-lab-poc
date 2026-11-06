import { createId } from '../shared'
import { automationPosition } from './evaluate'
import { canonicalAutomationPoints } from './edit'
import { MAX_TIMELINE_BEATS } from '../project'
import { MAX_AUTOMATION_POINTS, type AutomationLane, type AutomationPoint } from './types'

export const TOUCH_ERROR = 0.002
export const MAX_TOUCH_BEATS = 256
export const MAX_TOUCH_SAMPLES = 16384
const edge = 1e-7
const point = (beat: number, value: number, interpolation: AutomationPoint['interpolation']): AutomationPoint => ({ id: createId('point'), beat, value, interpolation })

/** Vertical normalized error, preserving endpoints and both sides of every hold transition. */
export const simplifyTouch = (points: readonly AutomationPoint[], tolerance = TOUCH_ERROR): readonly AutomationPoint[] => {
  if (points.length < 3) return points
  const keep = new Set([0, points.length - 1])
  for (let i = 1; i < points.length; i++) if (points[i - 1]!.interpolation === 'hold') { keep.add(i - 1); keep.add(i) }
  const anchors = [...keep].sort((a, b) => a - b)
  const pending = anchors.slice(1).map((end, i) => [anchors[i]!, end] as const)
  while (pending.length) {
    const [start, end] = pending.pop()!, a = points[start]!, b = points[end]!
    let worst = tolerance, at = -1
    for (let i = start + 1; i < end; i++) {
      const p = points[i]!, predicted = a.value + (b.value - a.value) * (p.beat - a.beat) / (b.beat - a.beat)
      const error = Math.abs(p.value - predicted)
      if (error > worst) { worst = error; at = i }
    }
    if (at !== -1) { keep.add(at); pending.push([start, at], [at, end]) }
  }
  return points.filter((_, i) => keep.has(i))
}

/**
 * Where a take lands in a lane: pass 0 starts at `offset`, each pass is `length` long, and the lane's points run over
 * `[0, extent]`. A clip's is `{ offset: 0, length, extent: length }`.
 */
export interface TouchSpan { readonly offset: number; readonly length: number; readonly extent: number }

/** Absolute local beats may span loops. Apply passes in time order; the latest touched span wins. */
export const applyTouch = (lane: AutomationLane, samples: readonly AutomationPoint[], { offset, length, extent }: TouchSpan, base: number): AutomationLane => {
  if (!samples.length) return lane
  let points = lane.points
  const first = samples[0]!, last = samples.at(-1)!
  if (last.beat - first.beat > MAX_TOUCH_BEATS || samples.length > MAX_TOUCH_SAMPLES) throw new Error('Touch take limit reached')
  const valueAt = (beat: number) => automationPosition({ ...lane, enabled: true, points: samples }, beat) ?? first.value
  for (let pass = Math.floor((first.beat - offset) / length); pass <= Math.floor((last.beat - offset) / length); pass++) {
    const shift = pass * length, start = Math.max(first.beat, offset + shift), end = Math.min(last.beat, offset + shift + length)
    if (end <= start && last.beat !== first.beat) continue
    const a = start - shift, b = end - shift
    const original = { ...lane, enabled: true, points }
    const before = automationPosition(original, Math.max(0, a - edge)) ?? base
    const after = automationPosition(original, Math.min(extent, b + edge)) ?? base
    const interpolation = first.interpolation
    const captured = simplifyTouch([
      point(a, valueAt(start), interpolation),
      ...samples.filter((p) => p.beat > start && p.beat < end).map((p) => ({ ...p, id: createId('point'), beat: p.beat - shift })),
      ...(b > a ? [point(b, valueAt(end), 'hold')] : []),
    ])
    const next = [...points.filter((p) => p.beat < a - edge || p.beat > b + edge),
      ...(a > 0 ? [point(Math.max(0, a - edge), before, 'hold')] : []), ...captured,
      ...(b < extent ? [point(Math.min(extent, b + edge), after, [...points].reverse().find((p) => p.beat <= b)?.interpolation ?? 'hold')] : []),
    ]
    if (next.length > MAX_AUTOMATION_POINTS) throw new Error('Touch would exceed 2048 points; take discarded')
    points = canonicalAutomationPoints(next, extent)
  }
  return { ...lane, enabled: true, points }
}

/**
 * A take into a timeline lane, its beats in take time (`beat + lap × brace length`, song beats without a brace). With
 * the brace, what came before its start is written straight and the rest by passes of the brace, into one lane.
 */
export const applyTimelineTouch = (lane: AutomationLane, samples: readonly AutomationPoint[], brace: { readonly from: number; readonly to: number } | undefined, base: number): AutomationLane => {
  const whole = { offset: 0, length: MAX_TIMELINE_BEATS, extent: MAX_TIMELINE_BEATS }
  if (!brace || samples[0]!.beat >= brace.from) return applyTouch(lane, samples, brace ? { offset: brace.from, length: brace.to - brace.from, extent: MAX_TIMELINE_BEATS } : whole, base)
  const before = samples.filter((p) => p.beat < brace.from), looped = samples.filter((p) => p.beat > brace.from)
  if (!looped.length) return applyTouch(lane, samples, whole, base)
  // Both parts meet at the brace's start, at the value the take had there.
  const at = automationPosition({ ...lane, enabled: true, points: samples }, brace.from) ?? before.at(-1)!.value
  const join = { ...before.at(-1)!, id: createId('point'), beat: brace.from, value: at }
  return applyTouch(applyTouch(lane, [...before, join], whole, base), [join, ...looped], { offset: brace.from, length: brace.to - brace.from, extent: MAX_TIMELINE_BEATS }, base)
}
