import { createNote } from '@core'
import { describe, expect, it } from 'vitest'
import {
  HIGH_PITCH,
  MAX_ZOOM,
  MIN_ZOOM,
  ROW_HEIGHT,
  centerPitch,
  clampZoom,
  isBlackKey,
  pitchAtY,
  pitchRows,
  rowOfPitch,
  scrollTopFor,
} from './piano-roll-geometry'

describe('piano roll geometry', () => {
  it('lays out the full MIDI range with the highest pitch on top', () => {
    const rows = pitchRows()
    expect(rows).toHaveLength(128)
    expect(rows[0]).toBe(HIGH_PITCH)
    expect(rows[127]).toBe(0)
  })

  it('maps between pitch and row position both ways', () => {
    for (const pitch of [0, 36, 60, 127]) {
      expect(pitchAtY(rowOfPitch(pitch) * ROW_HEIGHT + ROW_HEIGHT / 2)).toBe(pitch)
    }
    expect(pitchAtY(-50)).toBe(127)
    expect(pitchAtY(99999)).toBe(0)
  })

  it('knows the black keys', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([false, true, false, true, false, false, true])
  })

  it('centres on the note range, defaulting to middle C', () => {
    expect(centerPitch([])).toBe(60)
    expect(centerPitch([createNote(36, 0, 1), createNote(48, 1, 1)])).toBe(42)
  })

  it('scrolls so the centre pitch sits mid-viewport, never above the top', () => {
    expect(scrollTopFor(127, 400)).toBe(0)
    expect(scrollTopFor(60, 400)).toBeGreaterThan(0)
  })

  it('clamps zoom to its limits', () => {
    expect(clampZoom(1)).toBe(MIN_ZOOM)
    expect(clampZoom(10000)).toBe(MAX_ZOOM)
    expect(clampZoom(60)).toBe(60)
  })
})
