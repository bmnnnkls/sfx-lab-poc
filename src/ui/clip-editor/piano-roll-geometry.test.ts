import { describe, expect, it } from 'vitest'
import { centerPitch, pitchName, toggleNote } from './piano-roll-geometry'

describe('piano roll geometry', () => {
  it('names pitches', () => {
    expect(pitchName(60)).toBe('C4')
    expect(pitchName(69)).toBe('A4')
  })

  it('adds a note on an empty cell and removes it when toggled again', () => {
    const added = toggleNote([], 60, 1, 0.5)
    expect(added).toEqual([{ pitch: 60, start: 1, duration: 0.5, velocity: 0.9 }])
    expect(toggleNote(added, 60, 1.25, 0.5)).toEqual([])
  })

  it('centres on the note range, defaulting to middle C', () => {
    expect(centerPitch([])).toBe(60)
    expect(
      centerPitch([
        { pitch: 36, start: 0, duration: 1, velocity: 1 },
        { pitch: 48, start: 1, duration: 1, velocity: 1 },
      ]),
    ).toBe(42)
  })
})
