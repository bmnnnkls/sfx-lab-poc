import { createId } from '../shared'
import { automationPosition } from './evaluate'
import { canonicalAutomationPoints } from './edit'
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

/** Absolute local beats may span loops. Apply passes in time order; the latest touched span wins. */
export const applyTouch = (lane: AutomationLane, samples: readonly AutomationPoint[], length: number, base: number): AutomationLane => {
  if (!samples.length) return lane
  let points = lane.points
  const first = samples[0]!, last = samples.at(-1)!
  if (last.beat - first.beat > MAX_TOUCH_BEATS || samples.length > MAX_TOUCH_SAMPLES) throw new Error('Touch take limit reached')
  const valueAt = (beat: number) => automationPosition({ ...lane, enabled: true, points: samples }, beat) ?? first.value
  for (let pass = Math.floor(first.beat / length); pass <= Math.floor(last.beat / length); pass++) {
    const offset = pass * length, start = Math.max(first.beat, offset), end = Math.min(last.beat, offset + length)
    if (end <= start && last.beat !== first.beat) continue
    const a = start - offset, b = end - offset
    const original = { ...lane, enabled: true, points }
    const before = automationPosition(original, Math.max(0, a - edge)) ?? base
    const after = automationPosition(original, Math.min(length, b + edge)) ?? base
    const interpolation = first.interpolation
    const captured = simplifyTouch([
      point(a, valueAt(start), interpolation),
      ...samples.filter((p) => p.beat > start && p.beat < end).map((p) => ({ ...p, id: createId('point'), beat: p.beat - offset })),
      ...(b > a ? [point(b, valueAt(end), 'hold')] : []),
    ])
    const next = [...points.filter((p) => p.beat < a - edge || p.beat > b + edge),
      ...(a > 0 ? [point(Math.max(0, a - edge), before, 'hold')] : []), ...captured,
      ...(b < length ? [point(Math.min(length, b + edge), after, [...points].reverse().find((p) => p.beat <= b)?.interpolation ?? 'hold')] : []),
    ]
    if (next.length > MAX_AUTOMATION_POINTS) throw new Error('Touch would exceed 2048 points; take discarded')
    points = canonicalAutomationPoints(next, length)
  }
  return { ...lane, enabled: true, points }
}
