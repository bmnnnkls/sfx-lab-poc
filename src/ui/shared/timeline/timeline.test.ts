import { describe, expect, it } from 'vitest'
import { type Axis, autoScrollUnits, clampAxis, fitPerPixel, unitAt, xOf, zoomAxisAround, zoomAxisTo } from './axis'
import { SNAP_PX, type Snapping, snapTo } from './snap'
import { formatBeat, ticks } from './ticks'

/** A timeline in beats: 24 px a beat, 800 columns wide, over 400 beats; the closest zoom 256 px a beat. */
const MIN = 1 / 256
const AXIS: Axis = { start: 0, perPixel: 1 / 24, width: 800 }
const LENGTH = 400

describe('the axis', () => {
  it('fits a length in the width, never closer than the minimum', () => {
    expect(fitPerPixel(400, 800, MIN)).toBe(0.5)
    expect(fitPerPixel(1, 800, MIN)).toBe(MIN)
  })

  it('clamps the zoom and the scroll', () => {
    expect(clampAxis({ ...AXIS, perPixel: 1 / 1000 }, LENGTH, MIN).perPixel).toBe(MIN)
    expect(clampAxis({ ...AXIS, perPixel: 10 }, LENGTH, MIN).perPixel).toBe(0.5)
    expect(clampAxis({ ...AXIS, start: -5 }, LENGTH, MIN).start).toBe(0)
    expect(clampAxis({ ...AXIS, start: 1000 }, LENGTH, MIN).start).toBeCloseTo(400 - 800 / 24)
  })

  it('zooms around a column, keeping its beat there', () => {
    const before = { ...AXIS, start: 32 }
    const after = zoomAxisAround(before, 0.5, 300, LENGTH, MIN)
    expect(after.perPixel).toBeCloseTo(1 / 48)
    expect(unitAt(after, 300)).toBeCloseTo(unitAt(before, 300))
  })

  it('shows a range across the width', () => {
    const axis = zoomAxisTo(16, 32, 800, LENGTH, MIN)
    expect(axis.start).toBe(16)
    expect(xOf(axis, 32)).toBeCloseTo(800)
  })

  it('auto-scrolls only past an edge, growing with the distance, at most a quarter of the view', () => {
    expect(autoScrollUnits(0, 1, 800)).toBe(0)
    expect(autoScrollUnits(50, 1, 800)).toBe(5)
    expect(autoScrollUnits(-50, 1, 800)).toBe(-5)
    expect(autoScrollUnits(100_000, 1, 800)).toBe(200)
  })
})

describe('ticks in beats', () => {
  const label = (beats: number) => formatBeat(beats)
  it.each([
    { pxPerBeat: 1, step: 128 },
    { pxPerBeat: 24, step: 4 },
    { pxPerBeat: 256, step: 0.5 },
  ])('at $pxPerBeat px a beat, a label every $step beats', ({ pxPerBeat, step }) => {
    const steps = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
    const result = ticks({ start: 0, perPixel: 1 / pxPerBeat, width: 2000 }, 1, steps, label)
    expect(result[1]!.x - result[0]!.x).toBeCloseTo(step * pxPerBeat)
    expect(result[0]!.label).toBe('1.1')
  })

  it('starts at the first step inside a scrolled axis', () => {
    const result = ticks({ start: 5, perPixel: 1 / 24, width: 400 }, 1, [4], label)
    expect(result[0]!.label).toBe('3.1')
    expect(result[0]!.x).toBeCloseTo(3 * 24)
  })
})

describe('snapTo', () => {
  const EDGES: Snapping = { targets: [{ at: 16, key: 'a:start' }, { at: 20, key: 'b:end' }] }
  it('pulls to the nearest target within reach, in columns', () => {
    expect(snapTo(16.2, EDGES, AXIS)).toBe(16)
    expect(snapTo(16 + (SNAP_PX + 1) / 24, EDGES, AXIS)).toBeCloseTo(16 + (SNAP_PX + 1) / 24)
  })
  it('leaves out what a drag moves, and nothing with snapping off', () => {
    expect(snapTo(16.2, EDGES, AXIS, 'a:start')).toBe(16.2)
    expect(snapTo(16.2, null, AXIS)).toBe(16.2)
  })
  it('takes a computed target as one more candidate', () => {
    expect(snapTo(18.1, { targets: [], nearest: () => 18 }, AXIS)).toBe(18)
  })
})
