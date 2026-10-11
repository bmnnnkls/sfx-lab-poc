import { describe, expect, it } from 'vitest'
import { createNode, describeNode } from '@core'
import { clampToSpec, parseNumber, rowsOf, showsSlider } from './property-rows'

const rows = (type: string, patch: Partial<ReturnType<typeof createNode>> = {}, driven = new Map<string, string>()) => {
  const node = { ...createNode(type, 0, 0), ...patch }
  return rowsOf(node, describeNode(node)!, driven)
}
const row = (list: ReturnType<typeof rows>, id: string) => list.find((candidate) => candidate.spec.id === id)!

describe('property rows', () => {
  it('one row per parameter, with its stored value and a socket for numbers only', () => {
    const list = rows('filter')
    expect(list.map((r) => r.spec.id)).toEqual(['mode', 'cutoff', 'resonance', 'cvAmount'])
    expect(row(list, 'cutoff')).toMatchObject({ value: 2000, hasSocket: true, resetTo: 2000 })
    expect(row(list, 'mode').hasSocket).toBe(false)
  })

  it('a driven parameter says by what', () => {
    const list = rows('filter', {}, new Map([['cutoff', 'Control']]))
    expect(row(list, 'cutoff').drivenBy).toBe('Control')
    expect(row(list, 'resonance').drivenBy).toBeUndefined()
  })

  it('a control shows its live range and unit, and resets to its own default', () => {
    const base = createNode('control', 0, 0)
    const list = rows('control', { unit: 'Hz', params: { ...base.params, min: 20, max: 20000, default: 440, value: 1000 } })
    expect(row(list, 'value').spec).toMatchObject({ min: 20, max: 20000, unit: 'Hz' })
    expect(row(list, 'value')).toMatchObject({ value: 1000, resetTo: 440, hasSocket: false })
    expect(row(list, 'min').resetTo).toBe(0) // an ordinary parameter: the spec's default
  })

  it('an XY pad resets each axis to its own default', () => {
    const base = createNode('xyPad', 0, 0)
    const list = rows('xyPad', { params: { ...base.params, xDefault: 0.1, yDefault: 0.9 } })
    expect([row(list, 'x').resetTo, row(list, 'y').resetTo]).toEqual([0.1, 0.9])
  })

  it('offers a slider where one is usable: not for an enum, not for the wide bounds of a control setting', () => {
    const list = rows('control')
    expect(showsSlider(row(list, 'value').spec)).toBe(true)
    expect(showsSlider(row(list, 'min').spec)).toBe(false)
    expect(showsSlider(row(list, 'curve').spec)).toBe(false)
    expect(showsSlider(row(rows('filter'), 'cutoff').spec)).toBe(true)
  })
})

describe('number fields', () => {
  it('parses what a person types, with a decimal comma, and refuses the half-typed', () => {
    expect(parseNumber('12')).toBe(12)
    expect(parseNumber(' -3.5 ')).toBe(-3.5)
    expect(parseNumber('0,25')).toBe(0.25)
    expect(parseNumber('1e3')).toBe(1000)
    expect(parseNumber('.5')).toBe(0.5)
    for (const bad of ['', '-', '.', 'abc', '1.2.3', '1e', 'Infinity', '--1']) expect(parseNumber(bad), bad).toBeUndefined()
  })

  it('clamps to the range', () => {
    const spec = { id: 'x', label: 'X', min: 0, max: 2, default: 1 }
    expect([clampToSpec(spec, -5), clampToSpec(spec, 1.5), clampToSpec(spec, 9)]).toEqual([0, 1.5, 2])
  })
})
