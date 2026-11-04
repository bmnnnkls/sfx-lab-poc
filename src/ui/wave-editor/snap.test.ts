import { describe, expect, it } from 'vitest'
import { type Snapping, SNAP_PX, snapFrame } from './snap'

/** Ten frames a column: a target pulls from 80 frames away. */
const VIEW = { startFrame: 0, framesPerPixel: 10, width: 1000 }
const BEATS: Snapping = { targets: [{ frame: 1000, key: 'beat' }, { frame: 2000, key: 'beat' }] }
const MARKS: Snapping = { targets: [{ frame: 1050, key: 'marker:m' }, { frame: 1200, key: 'region:r:from' }, { frame: 5000, key: 'loop:to' }] }
const ZERO: Snapping = { targets: [], zero: (frame, radius) => (Math.abs(1500 - frame) <= radius ? 1500 : null) }

describe('snapFrame', () => {
  it.each([
    { what: 'a beat line within reach', frame: 1060, snapping: BEATS, expected: 1000 },
    { what: 'a marker', frame: 1040, snapping: MARKS, expected: 1050 },
    { what: 'a region edge', frame: 1260, snapping: MARKS, expected: 1200 },
    { what: 'a loop edge', frame: 4930, snapping: MARKS, expected: 5000 },
    { what: 'a zero crossing', frame: 1440, snapping: ZERO, expected: 1500 },
    { what: 'nothing out of reach', frame: 1200 + SNAP_PX * 10 + 1, snapping: MARKS, expected: 1281 },
    { what: 'the nearer of two', frame: 1120, snapping: MARKS, expected: 1050 },
    { what: 'the nearer of a target and a crossing', frame: 1470, snapping: { ...ZERO, targets: [{ frame: 1400, key: 'beat' }] }, expected: 1500 },
    { what: 'nothing with snapping off (Alt held)', frame: 1060, snapping: null, expected: 1060 },
  ])('pulls to $what', ({ frame, snapping, expected }) => {
    expect(snapFrame(frame, snapping, VIEW)).toBe(expected)
  })

  it('reaches in columns: zoomed in, a target the same frames away is out of reach', () => {
    expect(snapFrame(1060, BEATS, { ...VIEW, framesPerPixel: 1 })).toBe(1060)
  })

  it('leaves out what a drag moves', () => {
    expect(snapFrame(1040, MARKS, VIEW, 'marker:m')).toBe(1040)
    expect(snapFrame(1040, MARKS, VIEW, 'region:r:from')).toBe(1050)
  })
})
