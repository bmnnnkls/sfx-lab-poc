import { type PanelControl, type ParamSpec, addNode, createNode } from '@core'
import { describe, expect, it } from 'vitest'
import { defaultPosition, keyStep, knobWidth, positionOf, spanOf, valueAt, valueOf } from './panel-values'

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

describe('valueOf', () => {
  it('reads the node, falling back to the default', () => {
    const node = { ...createNode('gain', 0, 0), params: { gain: 0.3 } }
    const patch = addNode({ nodes: [], connections: [] }, node)
    expect(valueOf(patch, { node: node.id, param: 'gain' }, linear)).toBe(0.3)
    expect(valueOf(patch, { node: node.id, param: 'other' }, linear)).toBe(5)
    expect(valueOf(patch, { node: 'gone', param: 'gain' }, linear)).toBe(5)
  })
})

describe('spanOf', () => {
  const control = (extra: Partial<PanelControl>): PanelControl => ({
    id: 'c',
    kind: 'knob',
    label: 'C',
    bind: { node: 'n', param: 'p' },
    size: 'S',
    ...extra,
  })
  it('grows a knob square', () => {
    expect([control({}), control({ size: 'M' }), control({ size: 'L' })].map((c) => spanOf(c))).toEqual([
      { cols: 1, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 3 },
    ])
    expect(knobWidth('S')).toBeLessThan(knobWidth('M'))
    expect(knobWidth('M')).toBeLessThan(knobWidth('L'))
  })
  it('grows a slider along its length', () => {
    expect(spanOf(control({ kind: 'slider' }))).toEqual({ cols: 1, rows: 2 })
    expect(spanOf(control({ kind: 'slider', size: 'L' }))).toEqual({ cols: 1, rows: 4 })
    expect(spanOf(control({ kind: 'slider', orientation: 'horizontal', size: 'M' }))).toEqual({ cols: 3, rows: 1 })
  })
  it('gives a pad room and a many-option selector a double width', () => {
    expect(spanOf(control({ kind: 'xy' }))).toEqual({ cols: 2, rows: 2 })
    expect(spanOf(control({ kind: 'xy', size: 'M' }))).toEqual({ cols: 3, rows: 2 })
    expect(spanOf(control({ kind: 'selector' }), 2)).toEqual({ cols: 1, rows: 1 })
    expect(spanOf(control({ kind: 'selector' }), 5)).toEqual({ cols: 2, rows: 1 })
  })
})
