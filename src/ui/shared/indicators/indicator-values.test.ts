import { describe, expect, it } from 'vitest'
import { barFill, displayText, ledLook } from './indicator-values'

const node = (params: Record<string, number>, unit?: string) => ({ params, ...(unit === undefined ? {} : { unit }) })

describe('LED', () => {
  it('lights at the threshold and above in on/off mode, dark below', () => {
    expect(ledLook(node({ threshold: 0.5 }), 0.49).lit).toBe(false)
    expect(ledLook(node({ threshold: 0.5 }), 0.5)).toMatchObject({ lit: true, brightness: 1 })
    expect(ledLook(node({ threshold: -3 }), -2).lit).toBe(true)
  })

  it('follows the value between its two ends in brightness mode, either way round', () => {
    const dim = node({ mode: 1, low: 0, high: 10 })
    expect(ledLook(dim, 0).brightness).toBe(0)
    expect(ledLook(dim, 2.5).brightness).toBe(0.25)
    expect(ledLook(dim, 99).brightness).toBe(1)
    expect(ledLook(node({ mode: 1, low: 10, high: 0 }), 2.5).brightness).toBe(0.75)
    expect(ledLook(node({ mode: 1, low: 5, high: 5 }), 6).brightness).toBe(1)
  })

  it('is dark with no value, and picks the colour', () => {
    expect(ledLook(node({}), undefined)).toEqual({ brightness: 0, lit: false, colour: 'green' })
    expect(ledLook(node({ colour: 1 }), 1).colour).toBe('red')
    expect(ledLook(node({ colour: 99 }), 1).colour).toBe('blue')
    expect(ledLook(node({}), Number.NaN).lit).toBe(false)
  })
})

describe('number display', () => {
  it('shows the value to the chosen decimals with the unit', () => {
    expect(displayText(node({ decimals: 2 }), 3.14159)).toBe('3.14')
    expect(displayText(node({ decimals: 0 }, 'Hz'), 440.4)).toBe('440 Hz')
    expect(displayText(node({ decimals: 3 }, 'dB'), -12)).toBe('-12.000 dB')
  })

  it('defaults to two decimals, clamps silly decimals, and does not show negative zero', () => {
    expect(displayText(node({}), 1)).toBe('1.00')
    expect(displayText(node({ decimals: 40 }), 1)).toBe('1.000000')
    expect(displayText(node({ decimals: 2 }), -0.001)).toBe('0.00')
    expect(displayText(node({ decimals: 0 }), -0.2)).toBe('0')
  })

  it('shows a note name for a MIDI note, rounded and held to the keyboard', () => {
    expect(displayText(node({ style: 1 }), 60)).toBe('C4')
    expect(displayText(node({ style: 1 }), 69.4)).toBe('A4')
    expect(displayText(node({ style: 1 }), 500)).toBe('G9')
    expect(displayText(node({ style: 1 }), -5)).toBe('C-1')
  })

  it('is a dash for no value', () => {
    expect(displayText(node({}), undefined)).toBe('–')
    expect(displayText(node({}), Number.NaN)).toBe('–')
  })
})

describe('bar meter', () => {
  it('fills from empty to full over its range and stays inside it', () => {
    const bar = node({ min: 0, max: 10 })
    expect([-5, 0, 2.5, 10, 50].map((v) => barFill(bar, v))).toEqual([0, 0, 0.25, 1, 1])
  })

  it('works on ranges that start below zero and on inverted ones', () => {
    expect(barFill(node({ min: -60, max: 0 }), -30)).toBe(0.5)
    expect(barFill(node({ min: 10, max: 0 }), 2.5)).toBe(0.75)
  })

  it('is empty with no value, and never NaN when the ends are equal', () => {
    expect(barFill(node({}), undefined)).toBe(0)
    expect(barFill(node({ min: 3, max: 3 }), 3)).toBe(1)
    expect(barFill(node({ min: 3, max: 3 }), 2)).toBe(0)
  })
})
