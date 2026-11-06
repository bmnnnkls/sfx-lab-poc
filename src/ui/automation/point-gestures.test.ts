import { describe, expect, it } from 'vitest'
import { MAX_AUTOMATION_POINTS, type AutomationPoint } from '@core'
import { copyPoints, dragPoints, pastePoints, pressPoints, removePoints, segmentAt, setSegmentInterpolation, snapPointBeat } from './point-gestures'

const point = (id: string, beat: number, value = 0.5, interpolation: AutomationPoint['interpolation'] = 'linear'): AutomationPoint => ({ id, beat, value, interpolation })
const points = [point('a', 0, 0.2), point('b', 2, 0.6), point('c', 4, 0.4)]
const grid = { step: 0.25, length: 8 }
let next = 0
const newId = () => `new${next++}`
const none = new Set<string>()
const beats = (list: readonly AutomationPoint[] | null) => list?.map((p) => [p.id, p.beat, Math.round(p.value * 100) / 100])

describe('snapPointBeat', () => {
  it.each([
    [1.1, {}, 1],
    [1.13, {}, 1.25],
    [1.13, { alt: true }, 1.13],
    [-1, {}, 0],
    [9, {}, 8],
  ])('%s with %j is %s', (beat, keys, expected) => {
    expect(snapPointBeat(beat, grid, keys)).toBe(expected)
  })

  it("takes the caller's own snap over the step", () => {
    expect(snapPointBeat(1.1, { ...grid, snap: () => 3 })).toBe(3)
    expect(snapPointBeat(1.1, { ...grid, snap: () => 3 }, { alt: true })).toBe(1.1)
  })
})

describe('pressPoints', () => {
  it('adds a point on empty space, snapped, and drags it', () => {
    const result = pressPoints(points, null, { beat: 1.1, value: 0.7 }, {}, none, grid, () => 'n')
    expect(result.changed).toBe(true)
    expect(beats(result.points)).toContainEqual(['n', 1, 0.7])
    expect([...result.selected]).toEqual(['n'])
    expect(result.gesture?.kind).toBe('move')
  })

  it('refuses a point past the limit', () => {
    const full = Array.from({ length: MAX_AUTOMATION_POINTS }, (_, i) => point(`p${i}`, i / 1000))
    const result = pressPoints(full, null, { beat: 1, value: 0.5 }, {}, none, grid, newId)
    expect(result.changed).toBe(false)
    expect(result.gesture).toBeNull()
  })

  it('drags the selection from a selected point, or the point alone', () => {
    expect([...pressPoints(points, 'b', { beat: 2, value: 0.6 }, {}, new Set(['a', 'b']), grid, newId).selected]).toEqual(['a', 'b'])
    expect([...pressPoints(points, 'b', { beat: 2, value: 0.6 }, {}, new Set(['a']), grid, newId).selected]).toEqual(['b'])
  })

  it('toggles a point with Shift, and drags nothing', () => {
    const on = pressPoints(points, 'b', { beat: 2, value: 0.6 }, { shift: true }, new Set(['a']), grid, newId)
    expect([...on.selected]).toEqual(['a', 'b'])
    expect(on.gesture).toBeNull()
    expect([...pressPoints(points, 'b', { beat: 2, value: 0.6 }, { shift: true }, new Set(['a', 'b']), grid, newId).selected]).toEqual(['a'])
  })

  it('starts a box with ⌘ or Ctrl on empty space; Shift keeps the selection', () => {
    expect(pressPoints(points, null, { beat: 1, value: 0 }, { command: true }, new Set(['a']), grid, newId)).toMatchObject({ changed: false, gesture: { kind: 'box' }, selected: new Set() })
    expect([...pressPoints(points, null, { beat: 1, value: 0 }, { command: true, shift: true }, new Set(['a']), grid, newId).selected]).toEqual(['a'])
  })
})

describe('dragPoints', () => {
  const move = (selected: readonly string[], from = { beat: 2, value: 0.6 }) => ({ kind: 'move' as const, origin: points, selected: new Set(selected), from })

  it('moves the selection by the snapped distance and the value change', () => {
    expect(beats(dragPoints(move(['b']), { beat: 3.1, value: 0.7 }, {}, grid).points)).toEqual([['a', 0, 0.2], ['b', 3, 0.7], ['c', 4, 0.4]])
  })

  it('keeps the beats with Shift, and snaps nothing with Alt', () => {
    expect(beats(dragPoints(move(['b']), { beat: 3.1, value: 0.7 }, { shift: true }, grid).points)).toEqual([['a', 0, 0.2], ['b', 2, 0.7], ['c', 4, 0.4]])
    expect(dragPoints(move(['b']), { beat: 3.1, value: 0.6 }, { alt: true }, grid).points![1]!.beat).toBeCloseTo(3.1)
  })

  it('stops a group at the edges and the value range, keeping its shape', () => {
    expect(beats(dragPoints(move(['a', 'b']), { beat: -5, value: 0 }, {}, grid).points)).toEqual([['a', 0, 0], ['b', 2, 0], ['c', 4, 0.4]])
    expect(beats(dragPoints(move(['b', 'c']), { beat: 20, value: 0.6 }, {}, grid).points)).toEqual([['a', 0, 0.2], ['b', 6, 0.6], ['c', 8, 0.4]])
  })

  it('a box selects the points inside it, with the base selection', () => {
    const box = { kind: 'box' as const, origin: points, from: { beat: 1, value: 0.3 }, base: new Set(['a']) }
    expect([...dragPoints(box, { beat: 5, value: 1 }, {}, grid).selected].sort()).toEqual(['a', 'b', 'c'])
    expect([...dragPoints(box, { beat: 3, value: 1 }, {}, grid).selected].sort()).toEqual(['a', 'b'])
  })
})

describe('copy, paste, remove and segments', () => {
  it('copies from the first selected beat and pastes at a beat, leaving out what lands past the length', () => {
    const copied = copyPoints(points, new Set(['b', 'c']))
    expect(beats(copied)).toEqual([['b', 0, 0.6], ['c', 2, 0.4]])
    const { points: pasted, pasted: ids } = pastePoints(points, copied, 7, 8, newId)
    expect(pasted).toHaveLength(4)
    expect(ids.size).toBe(1)
    expect(removePoints(points, new Set(['a', 'c'])).map((p) => p.id)).toEqual(['b'])
  })

  it('finds the segment holding a beat and switches its interpolation', () => {
    expect(segmentAt(points, 3)?.id).toBe('b')
    expect(segmentAt([point('x', 1)], 0.5)).toBeUndefined()
    const held = setSegmentInterpolation(points, 3, 'hold')
    expect(held.map((p) => p.interpolation)).toEqual(['linear', 'hold', 'linear'])
    expect(setSegmentInterpolation(held, 3, 'hold')).toBe(held)
  })
})
