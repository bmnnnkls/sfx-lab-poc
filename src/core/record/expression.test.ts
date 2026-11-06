import { describe, expect, it } from 'vitest'
import { type AutomationLane, MAX_AUTOMATION_POINTS, automationPosition } from '../automation'
import type { ExpressionControl } from '../midi'
import { applyExpression, expressionSpans, isRecordedExpression, placeSpan, splitLanes, takeControls } from './expression'
import { type TakeEvent, takeNotes } from './take'

/** Messages 20 ms a beat apart by default: a control moving, never held. */
const event = (beat: number, control: ExpressionControl, value: number, at = beat * 20): TakeEvent =>
  ({ kind: 'expression', beat, at, source: 'keys', channel: 0, control, value })
const shapes = (events: readonly TakeEvent[], control: ExpressionControl, range = { start: 0 }) =>
  expressionSpans(events, control, range).map((span) => span.samples.map((s) => [s.beat, Number(s.value.toFixed(4))]))
const lane = (points: AutomationLane['points'] = []): AutomationLane =>
  ({ id: 'lane', enabled: true, target: { kind: 'expression', owner: { kind: 'track', trackId: 't' }, control: 'pitchBend' }, points })

describe('expression spans', () => {
  it('a bend runs from leaving the centre to coming back, normalized to the lane', () => {
    const events = [event(0, 'pitchBend', 0), event(1, 'pitchBend', 0.5), event(1.5, 'pitchBend', 1), event(2, 'pitchBend', 0), event(3, 'pitchBend', -1), event(3.5, 'pitchBend', 0)]
    expect(shapes(events, 'pitchBend')).toEqual([[[1, 0.75], [1.5, 1], [2, 0.5]], [[3, 0], [3.5, 0.5]]])
  })

  it('a jump straight past the centre stays one span', () => {
    expect(shapes([event(1, 'pitchBend', 0.5), event(2, 'pitchBend', -0.5), event(3, 'pitchBend', 0)], 'pitchBend')).toEqual([[[1, 0.75], [2, 0.25], [3, 0.5]]])
  })

  it('a bend that never comes back is open, and holds its value to `close`', () => {
    const [span] = expressionSpans([event(1, 'pitchBend', 0.5)], 'pitchBend', { start: 0, close: 4 })
    expect(span).toEqual({ open: true, samples: [{ beat: 1, value: 0.75 }, { beat: 4, value: 0.75 }] })
  })

  it('a value held between messages steps to the next one instead of ramping', () => {
    const events = [event(1, 'pressure', 0.4, 0), event(5, 'pressure', 0.8, 2000), event(5.5, 'pressure', 0, 2010)]
    expect(shapes(events, 'pressure')).toEqual([[[1, 0.4], [4.9999, 0.4], [5, 0.8], [5.5, 0]]])
  })

  it('pressure runs from above 0 to 0', () => {
    const events = [event(0, 'pressure', 0), event(1, 'pressure', 0.4), event(2, 'pressure', 0.8), event(3, 'pressure', 0), event(4, 'pressure', 0)]
    expect(shapes(events, 'pressure')).toEqual([[[1, 0.4], [2, 0.8], [3, 0]]])
  })

  it('a CC span ends after 800 ms without a message, on the events’ own clock', () => {
    const cc = { cc: 1 }
    const events = [event(1, cc, 0.1, 1000), event(1.5, cc, 0.2, 1030), event(2, cc, 0.3, 1830), event(2.1, cc, 0.4, 1860)]
    expect(shapes(events, cc)).toEqual([[[1, 0.1], [1.5, 0.2]], [[2, 0.3], [2.1, 0.4]]])
    const [, last] = expressionSpans(events, cc, { start: 0, nowMs: 2600 })
    expect(last!.open).toBe(true)
    expect(expressionSpans(events, cc, { start: 0, nowMs: 2700 })[1]!.open).toBe(false)
  })

  it('keeps early events at the start, drops earlier ones and those at the end', () => {
    const events = [event(3, 'pitchBend', 0.2), event(3.9, 'pitchBend', 0.4), event(5, 'pitchBend', 0.6), event(8, 'pitchBend', 0.8)]
    expect(shapes(events, 'pitchBend', { start: 4, end: 8 } as never)).toEqual([[[4, 0.7], [5, 0.8]]])
  })

  it('an end event closes the span there, holding its value', () => {
    const events: TakeEvent[] = [event(1, 'pitchBend', 0.5), { ...(event(2, 'pitchBend', 0) as Extract<TakeEvent, { kind: 'expression' }>), end: true }, event(3, 'pitchBend', 0.2)]
    expect(expressionSpans(events, 'pitchBend', { start: 0 }).map((span) => [span.open, span.samples.map((s) => s.beat)])).toEqual([[false, [1, 2]], [true, [3]]])
  })

  it('records the wheel, pressure, the mod wheel and the ticked CCs only; notes ignore the events', () => {
    expect([isRecordedExpression('pitchBend', []), isRecordedExpression('pressure', []), isRecordedExpression({ cc: 1 }, []), isRecordedExpression({ cc: 74 }, []), isRecordedExpression({ cc: 74 }, [74])]).toEqual([true, true, true, false, true])
    const events = [event(1, { cc: 74 }, 0.5), event(2, 'pitchBend', 0.5), event(3, { cc: 74 }, 0.6)]
    expect([...takeControls(events).keys()]).toEqual(['cc:74', 'pitchBend'])
    expect(takeNotes(events, { id: 't', start: 0, end: 4 })).toEqual([])
  })
})

describe('placing spans', () => {
  it('without a loop, relative to the start', () => {
    expect(placeSpan([{ beat: 5, value: 1 }], { start: 4 })).toEqual([[{ beat: 1, value: 1 }]])
  })

  it('cuts a span across a clip’s wrap into one piece per pass', () => {
    const pieces = placeSpan([{ beat: 3, value: 0 }, { beat: 5, value: 1 }], { start: 0, loop: { anchor: 0, length: 4 } })
    expect(pieces).toEqual([[{ beat: 3, value: 0 }, { beat: 4, value: 0.5 }], [{ beat: 0, value: 0.5 }, { beat: 1, value: 1 }]])
  })

  it('keeps a lead-in before the brace in place and wraps later passes after it', () => {
    // The region starts at 2, the brace runs from 4 to 8: the lead-in is at 1..2 of the region, a later pass at 2 + local.
    const loop = { anchor: 4, length: 4, origin: 2 }
    expect(placeSpan([{ beat: 3, value: 0.2 }, { beat: 3.5, value: 0.3 }], { start: 3, loop })).toEqual([[{ beat: 1, value: 0.2 }, { beat: 1.5, value: 0.3 }]])
    expect(placeSpan([{ beat: 13, value: 0.4 }], { start: 3, loop })).toEqual([[{ beat: 3, value: 0.4 }]])
  })
})

describe('applying spans to a lane', () => {
  it('a later pass replaces an earlier one where they overlap, and keeps the lane around it', () => {
    const first = [{ beat: 0, value: 0.2 }, { beat: 2, value: 0.2 }]
    const second = [{ beat: 1, value: 0.9 }, { beat: 1.5, value: 0.9 }]
    const { lane: result, overflow } = applyExpression(lane(), [first, second], 4, 0.5)
    expect(overflow).toBe(false)
    expect(automationPosition(result, 0.5)).toBeCloseTo(0.2)
    expect(automationPosition(result, 1.25)).toBeCloseTo(0.9)
    expect(automationPosition(result, 1.9)).toBeCloseTo(0.2)
    expect(automationPosition(result, 3)).toBeCloseTo(0.5)
  })

  it('an overdub keeps the lane it had outside its span', () => {
    const before = lane([{ id: 'a', beat: 0, value: 0.1, interpolation: 'hold' }])
    const { lane: result } = applyExpression(before, [[{ beat: 2, value: 1 }, { beat: 3, value: 0.5 }]], 4, 0.5)
    expect(automationPosition(result, 1)).toBeCloseTo(0.1)
    expect(automationPosition(result, 2.5)).toBeCloseTo(0.75)
    expect(automationPosition(result, 3.5)).toBeCloseTo(0.1)
  })

  it('stops at the piece that would pass 2048 points, keeping what it had', () => {
    const zigzag = (from: number) => Array.from({ length: 1500 }, (_, i) => ({ beat: from + i * 0.001, value: i % 2 }))
    const { lane: result, applied, overflow } = applyExpression(lane(), [zigzag(0), zigzag(2)], 4, 0.5)
    expect(overflow).toBe(true)
    expect(applied).toBe(1)
    expect(result.points.length).toBeLessThanOrEqual(MAX_AUTOMATION_POINTS)
    expect(automationPosition(result, 3)).toBeCloseTo(0.5)
  })

  it('a piece past a 64-bar split goes on in the next region from a point holding its value', () => {
    const regions = splitLanes([[{ beat: 254, value: 0 }, { beat: 258, value: 1 }]])
    expect(regions).toEqual([[[{ beat: 254, value: 0 }, { beat: 256, value: 0.5 }]], [[{ beat: 0, value: 0.5 }, { beat: 2, value: 1 }]]])
  })
})
