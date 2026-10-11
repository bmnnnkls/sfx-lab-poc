import { createNote } from '@core'
import { describe, expect, it } from 'vitest'
import { LANE_HEIGHT, barTop, pickNoteAt, velocityAtY } from './velocity-lane-logic'

describe('velocity lane', () => {
  it('maps the top of the lane to full velocity and the bottom to nearly none', () => {
    expect(velocityAtY(0)).toBe(1)
    expect(velocityAtY(LANE_HEIGHT)).toBeLessThan(0.1)
    expect(velocityAtY(LANE_HEIGHT)).toBeGreaterThan(0)
  })

  it('round-trips between a velocity and its bar position', () => {
    for (const velocity of [0.1, 0.5, 0.9, 1]) {
      expect(velocityAtY(barTop(velocity))).toBeCloseTo(velocity, 6)
    }
  })

  it('picks the bar under the pointer, ignoring ones out of reach horizontally', () => {
    const near = createNote(60, 2, 1) // x = 112 at 56 px/beat
    const far = createNote(62, 5, 1)
    expect(pickNoteAt([near, far], 114, 20, 56)).toBe(near)
    expect(pickNoteAt([near, far], 60, 20, 56)).toBeUndefined()
  })

  it('among chord bars at the same x, grabs the one whose top is nearest the pointer', () => {
    const quiet = createNote(60, 0, 1, 0.2)
    const loud = createNote(64, 0, 1, 0.9)
    expect(pickNoteAt([quiet, loud], 0, barTop(0.9), 56)).toBe(loud)
    expect(pickNoteAt([quiet, loud], 0, barTop(0.2), 56)).toBe(quiet)
  })
})
