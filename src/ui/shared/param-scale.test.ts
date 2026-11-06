import { describe, expect, it } from 'vitest'
import type { ParamSpec } from '@core'
import { displayValue, formatParam, fromDisplayValue } from './param-scale'

const bend = (range: number): ParamSpec => ({ id: 'pitchBend', label: 'Pitch bend', min: -1, max: 1, default: 0, unit: 'st', format: 'bend', displayScale: range })
const cc: ParamSpec = { id: 'cc1', label: 'CC 1', min: 0, max: 1, default: 0, format: 'midi7' }

describe('expression values as a musician reads them', () => {
  it('shows a bend in semitones at the track’s range, and a range of 0 as rest', () => {
    expect(formatParam(bend(2), 0.7)).toBe('+1.40 st')
    expect(formatParam(bend(12), -0.5)).toBe('−6.00 st')
    expect(formatParam(bend(2), 0)).toBe('±0.00 st')
    expect(formatParam(bend(0), 1)).toBe('±0')
  })

  it('shows pressure and CCs 0 to 127', () => {
    expect(formatParam(cc, 0)).toBe('0')
    expect(formatParam(cc, 1)).toBe('127')
    expect(formatParam(cc, 0.5)).toBe('64')
  })

  it('reads a typed number back', () => {
    expect(displayValue(bend(2), 0.7)).toBeCloseTo(1.4)
    expect(fromDisplayValue(bend(2), 1.4)).toBeCloseTo(0.7)
    expect(fromDisplayValue(bend(0), 5)).toBe(0)
    expect(fromDisplayValue(cc, 127)).toBe(1)
    expect(displayValue({ ...cc, format: undefined }, 0.25)).toBe(0.25)
  })
})
