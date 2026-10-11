import { type PanelItem, type ParamSpec, createNode, describeNode } from '@core'
import { describe, expect, it } from 'vitest'
import { axisSpec, defaultPosition, keyStep, knobWidth, positionOf, spanOf, valueAt } from './panel-values'

const linear: ParamSpec = { id: 'a', label: 'A', min: 0, max: 10, default: 5 }
const log: ParamSpec = { id: 'f', label: 'F', min: 20, max: 20000, default: 2000 }
const stepped: ParamSpec = { id: 's', label: 'S', min: -1200, max: 1200, default: 0, step: 1 }

describe('position <-> value', () => {
  it('maps the ends and the middle of a linear range', () => {
    expect(positionOf(linear, 0)).toBe(0)
    expect(positionOf(linear, 10)).toBe(1)
    expect(positionOf(linear, 5)).toBe(0.5)
    expect(valueAt(linear, 0.25)).toBe(2.5)
  })

  it('puts the geometric middle of a wide range in the middle of a log control', () => {
    expect(positionOf(log, Math.sqrt(20 * 20000))).toBeCloseTo(0.5, 10)
    expect(valueAt(log, 0.5)).toBeCloseTo(Math.sqrt(20 * 20000), 6)
  })

  it('round-trips through a position', () => {
    for (const spec of [linear, log]) for (const position of [0, 0.1, 0.5, 0.9, 1]) expect(positionOf(spec, valueAt(spec, position))).toBeCloseTo(position, 8)
  })

  it('snaps to the step and stays inside the range, whatever the position', () => {
    expect(valueAt(stepped, 0.50004)).toBe(0)
    expect(Number.isInteger(valueAt(stepped, 0.123456))).toBe(true)
    expect(valueAt(linear, 2)).toBe(10)
    expect(valueAt(linear, -2)).toBe(0)
    expect(positionOf(linear, 99)).toBe(1)
  })

  it('the default position is where the default value sits', () => {
    expect(defaultPosition(linear)).toBe(0.5)
    expect(valueAt(log, defaultPosition(log))).toBeCloseTo(2000, 6)
  })
})

describe('keyStep', () => {
  it('is one whole step for a stepped linear parameter, 1% otherwise', () => {
    expect(keyStep(stepped)).toBeCloseTo(1 / 2400, 10)
    expect(keyStep(linear)).toBe(0.01)
    expect(keyStep(log)).toBe(0.01)
    expect(keyStep({ ...linear, step: 5 })).toBe(0.25)
  })
})

describe('axisSpec', () => {
  it('is a control\'s live range, curve and unit, with its own default as the reset value', () => {
    const base = createNode('control', 0, 0)
    const node = { ...base, unit: 'Hz', params: { ...base.params, min: 20, max: 20000, curve: 1, value: 500, default: 440 } }
    const spec = axisSpec(node, describeNode(node)!, 'value')!
    expect(spec).toMatchObject({ min: 20, max: 20000, unit: 'Hz', curve: 'log', default: 440 })
    expect(valueAt(spec, positionOf(spec, 500))).toBeCloseTo(500, 6)
    expect(valueAt(spec, defaultPosition(spec))).toBeCloseTo(440, 6)
  })

  it('reads each axis of a pad on its own', () => {
    const base = createNode('xyPad', 0, 0)
    const node = { ...base, params: { ...base.params, xMax: 10, yMax: 100, yDefault: 25 } }
    const shape = describeNode(node)!
    expect(axisSpec(node, shape, 'x')).toMatchObject({ max: 10 })
    expect(axisSpec(node, shape, 'y')).toMatchObject({ max: 100, default: 25 })
    expect(axisSpec(node, shape, 'nope')).toBeUndefined()
  })

  it('a log curve and an exp curve change where a position lands', () => {
    const base = createNode('control', 0, 0)
    const at = (curve: number) => {
      const node = { ...base, params: { ...base.params, min: 1, max: 100, curve } }
      return valueAt(axisSpec(node, describeNode(node)!, 'value')!, 0.5)
    }
    expect(at(0)).toBeCloseTo(50.5, 6)
    expect(at(1)).toBeCloseTo(10, 6)
    expect(at(2)).toBeLessThan(50.5)
  })
})

describe('spanOf', () => {
  const item = (extra: Partial<Pick<PanelItem, 'kind' | 'size' | 'horizontal'>>) => ({ kind: 'knob' as const, size: 'S' as const, horizontal: false, ...extra })
  it('grows a knob square', () => {
    expect([item({}), item({ size: 'M' }), item({ size: 'L' })].map(spanOf)).toEqual([
      { cols: 1, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 3 },
    ])
    expect(knobWidth('S')).toBeLessThan(knobWidth('M'))
    expect(knobWidth('M')).toBeLessThan(knobWidth('L'))
  })
  it('grows a slider along its length', () => {
    expect(spanOf(item({ kind: 'slider' }))).toEqual({ cols: 1, rows: 2 })
    expect(spanOf(item({ kind: 'slider', size: 'L' }))).toEqual({ cols: 1, rows: 4 })
    expect(spanOf(item({ kind: 'slider', horizontal: true, size: 'M' }))).toEqual({ cols: 3, rows: 1 })
  })
  it('gives a pad room and a switch one row', () => {
    expect(spanOf(item({ kind: 'xy' }))).toEqual({ cols: 2, rows: 2 })
    expect(spanOf(item({ kind: 'xy', size: 'M' }))).toEqual({ cols: 3, rows: 2 })
    expect(spanOf(item({ kind: 'switch' }))).toEqual({ cols: 1, rows: 1 })
    expect(spanOf(item({ kind: 'switch', size: 'L' }))).toEqual({ cols: 3, rows: 1 })
    expect(spanOf(item({ kind: 'selector' }))).toEqual({ cols: 2, rows: 1 })
    expect(spanOf(item({ kind: 'selector', size: 'L' }))).toEqual({ cols: 4, rows: 1 })
  })
})
