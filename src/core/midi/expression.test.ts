import { describe, expect, it } from 'vitest'
import { midiToFrequency } from '../shared'
import { BEND_RANGE, PressureFold, bentFrequency, ccLabel, clampBendRange, expressionKey, isExpressionCC, isExpressionControl } from './expression'

describe('expression controls', () => {
  it('takes CCs 0 to 119 except the sustain pedal', () => {
    expect([0, 1, 63, 65, 119].every(isExpressionCC)).toBe(true)
    expect([64, 120, 127, -1, 1.5, Number.NaN].some(isExpressionCC)).toBe(false)
  })

  it('keys and checks controls', () => {
    expect(expressionKey('pitchBend')).toBe('pitchBend')
    expect(expressionKey({ cc: 1 })).toBe('cc:1')
    expect(isExpressionControl('pressure')).toBe(true)
    expect(isExpressionControl({ cc: 74 })).toBe(true)
    expect(isExpressionControl({ cc: 64 })).toBe(false)
    expect(isExpressionControl('aftertouch')).toBe(false)
    expect(isExpressionControl(null)).toBe(false)
  })

  it('names the common CCs', () => {
    expect(ccLabel(1)).toBe('1 Mod wheel')
    expect(ccLabel(74)).toBe('74 Brightness')
    expect(ccLabel(21)).toBe('21')
  })
})

describe('bentFrequency', () => {
  it.each([
    [0, 2, 0],
    [1, 2, 2],
    [-1, 2, -2],
    [0.5, 12, 6],
    [1, 12, 12],
    [1, 0, 0],
  ])('bend %d at range %d moves the note %d semitones', (bend, range, semitones) => {
    expect(bentFrequency(60, bend, range)).toBeCloseTo(midiToFrequency(60 + semitones), 9)
  })
})

describe('clampBendRange', () => {
  it('rounds and clamps, and falls back to 2 for a non-number', () => {
    expect(clampBendRange(12.4)).toBe(12)
    expect(clampBendRange(30)).toBe(24)
    expect(clampBendRange(-3)).toBe(0)
    expect(clampBendRange(Number.NaN)).toBe(BEND_RANGE.default)
  })
})

describe('PressureFold', () => {
  it('is the highest of channel pressure and the held keys', () => {
    const fold = new PressureFold()
    expect(fold.set(0.2)).toBe(0.2)
    expect(fold.key(60, 0.5)).toBe(0.5)
    expect(fold.key(64, 0.3)).toBe(0.5)
    expect(fold.set(0.1)).toBe(0.5)
    expect(fold.keyUp(60)).toBe(0.3)
    expect(fold.keyUp(62)).toBeUndefined()
    expect(fold.key(64, 0)).toBe(0.1)
    expect(fold.set(0)).toBe(0)
  })
})
