import { ARRANGEMENT_ZOOM } from '@state'
import { describe, expect, it } from 'vitest'
import { gridSpacing } from './timeline-geometry'
import { minPxPerBeat, zoomFor } from './use-timeline-zoom'

describe('the arrangement zoom', () => {
  it('zooms out no further than the whole timeline in the width, nor past the bounds', () => {
    expect(minPxPerBeat(128, 1280)).toBe(10)
    expect(minPxPerBeat(4096, 100)).toBe(ARRANGEMENT_ZOOM.min)
    expect(minPxPerBeat(1, 10_000)).toBe(ARRANGEMENT_ZOOM.max)
  })

  it('fits the content from 0', () => {
    expect(zoomFor('fit', 64, 1280, 1)).toEqual({ pxPerBeat: 20, scrollLeft: 0 })
  })

  it('shows a range across the width, scrolled to its start', () => {
    expect(zoomFor({ from: 12, to: 28 }, 64, 800, 1)).toEqual({ pxPerBeat: 50, scrollLeft: 600 })
    // Never closer than the closest zoom.
    expect(zoomFor({ from: 0, to: 0.01 }, 64, 800, 1).pxPerBeat).toBe(ARRANGEMENT_ZOOM.max)
  })
})

describe('the lanes’ lines', () => {
  it('draws bars, and grid lines at the grid step while they are far enough apart', () => {
    expect(gridSpacing(24, 0.25)).toEqual({ barPx: 96, gridPx: 6 })
    expect(gridSpacing(8, 0.25)).toEqual({ barPx: 32, gridPx: 32 })
    expect(gridSpacing(24, null)).toEqual({ barPx: 96, gridPx: 96 })
  })

  it('draws every fourth bar when bars are too close', () => {
    expect(gridSpacing(0.5, 1)).toEqual({ barPx: 8, gridPx: 8 })
    expect(gridSpacing(0.1, 1).barPx).toBeCloseTo(6.4)
  })
})
