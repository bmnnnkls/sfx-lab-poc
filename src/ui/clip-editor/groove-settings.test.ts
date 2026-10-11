import { describe, expect, it } from 'vitest'
import { DEFAULT_GROOVE, isGrooveSettings } from './groove-settings'

describe('isGrooveSettings', () => {
  it('accepts the defaults and sensible changes', () => {
    expect(isGrooveSettings(DEFAULT_GROOVE)).toBe(true)
    expect(isGrooveSettings({ ...DEFAULT_GROOVE, strength: 0.5, swing: 70 })).toBe(true)
  })

  it('rejects stale, partial or tampered stored values', () => {
    expect(isGrooveSettings(null)).toBe(false)
    expect(isGrooveSettings({})).toBe(false)
    expect(isGrooveSettings({ ...DEFAULT_GROOVE, swing: 20 })).toBe(false)
    expect(isGrooveSettings({ ...DEFAULT_GROOVE, strength: 'x' })).toBe(false)
    expect(isGrooveSettings({ ...DEFAULT_GROOVE, ends: 1 })).toBe(false)
  })
})
