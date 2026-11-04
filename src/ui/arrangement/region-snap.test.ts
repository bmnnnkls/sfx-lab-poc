import { createArrangementClip, createClip } from '@core'
import { describe, expect, it } from 'vitest'
import { regionSnapping, snapBeat, snapRegionStart } from './region-snap'

/** 24 px a beat: a target pulls from a third of a beat away (8 px). */
const AXIS = { start: 0, perPixel: 1 / 24, width: 800 }
const at = (id: string, trackId: string, startBeat: number, length: number) => ({ ...createArrangementClip(trackId, startBeat, createClip(id, length)), id })
const REGIONS = [at('a', 'one', 0, 4), at('b', 'two', 10.3, 4), at('moving', 'one', 20, 4)]

describe('region snapping', () => {
  it("targets every other region's edges, on any lane, not the moving one's", () => {
    expect(regionSnapping(REGIONS, 'moving').targets.map((target) => target.at)).toEqual([0, 4, 10.3, 14.3])
  })

  it.each([
    { what: 'the grid line', beat: 6.1, grid: 1, expected: 6 },
    { what: 'a region edge nearer than the grid line', beat: 10.25, grid: 1, expected: 10.3 },
    { what: 'the grid line nearer than an edge', beat: 9.9, grid: 1, expected: 10 },
    { what: 'an edge with the grid off', beat: 14.1, grid: null, expected: 14.3 },
    { what: 'nothing out of reach with the grid off', beat: 7.5, grid: null, expected: 7.5 },
    { what: 'never before 0', beat: -0.4, grid: 1, expected: 0 },
  ])('pulls to $what', ({ beat, grid, expected }) => {
    expect(snapBeat(beat, grid, regionSnapping(REGIONS, 'moving'), AXIS)).toBeCloseTo(expected)
  })

  it('leaves the beat alone with Alt (no grid and no targets)', () => {
    expect(snapBeat(6.1, null, null, AXIS)).toBe(6.1)
  })

  it("snaps a moved region's end when it is nearer a line than its start", () => {
    const snap = (beat: number) => snapBeat(beat, 4, null, AXIS)
    // A 3-beat region asked at 4.9: its start is 0.9 from bar 2, its end (7.9) 0.1 from bar 3.
    expect(snapRegionStart(4.9, 3, snap)).toBe(5)
    expect(snapRegionStart(4.3, 3, snap)).toBe(4)
  })

  it('keeps a start that snapped when the end snaps to nothing', () => {
    const snap = (beat: number) => snapBeat(beat, null, regionSnapping(REGIONS, 'moving'), AXIS)
    // Near region a's end (4), with the moving region's end (8.2) near nothing.
    expect(snapRegionStart(4.2, 4, snap)).toBe(4)
    // Near nothing at either end: where it was asked.
    expect(snapRegionStart(6.5, 1, snap)).toBe(6.5)
  })
})
