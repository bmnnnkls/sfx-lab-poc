import { describe, expect, it } from 'vitest'
import { WHEEL_ZOOM } from '../shared/timeline'
import { type TimelineKeyState, timelineKeyAction } from './timeline-keys'

const STATE: TimelineKeyState = { position: 5, gridBeats: 1, visibleBeats: 40, end: 64, selection: { from: 8, to: 24 } }

describe('the timeline keys', () => {
  it.each([
    { key: 'arrowright', state: STATE, expected: { position: 6 } },
    { key: 'arrowleft', state: STATE, expected: { position: 4 } },
    { key: 'arrowright', state: { ...STATE, position: 5.3 }, expected: { position: 6 } },
    { key: 'arrowleft', state: { ...STATE, position: 5.3 }, expected: { position: 5 } },
    { key: 'arrowright', state: { ...STATE, gridBeats: 4 }, expected: { position: 8 } },
    { key: 'arrowleft', state: { ...STATE, position: 0 }, expected: { position: 0 } },
    { key: 'arrowright', state: { ...STATE, gridBeats: null, position: 5.5 }, expected: { position: 6 } },
    { key: 'alt+arrowright', state: STATE, expected: { position: 9 } },
    { key: 'alt+arrowleft', state: STATE, expected: { position: 1 } },
    { key: 'home', state: STATE, expected: { position: 0 } },
    { key: 'end', state: STATE, expected: { position: 64 } },
    { key: 'z', state: STATE, expected: { zoomTo: { from: 8, to: 24 } } },
    { key: 'z', state: { ...STATE, selection: null }, expected: null },
    { key: 'shift+z', state: STATE, expected: { zoomTo: 'fit' } },
    { key: 'f', state: STATE, expected: { toggleFollow: true } },
    { key: 'q', state: STATE, expected: null },
    { key: 'space', state: STATE, expected: null },
  ])('$key at $state.position', ({ key, state, expected }) => {
    expect(timelineKeyAction(key, state)).toEqual(expected)
  })

  it('zooms by two wheel notches', () => {
    expect(timelineKeyAction('plus', STATE)?.zoomBy).toBeCloseTo(WHEEL_ZOOM ** 2)
    expect(timelineKeyAction('=', STATE)?.zoomBy).toBeCloseTo(WHEEL_ZOOM ** 2)
    expect(timelineKeyAction('-', STATE)?.zoomBy).toBeCloseTo(WHEEL_ZOOM ** -2)
  })
})
