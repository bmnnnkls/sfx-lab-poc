import { describe, expect, it } from 'vitest'
import { createNode, describeNode, requireNodeDefinition } from '@core'
import { HEADER_HEIGHT, NODE_WIDTH, PORT_ROW_HEIGHT, nodeHeight, portPosition } from './geometry'
import { formatParam, fromSlider, snapToStep, toSlider } from '../shared/param-scale'

describe('patcher geometry', () => {
  it('places inputs on the left edge and outputs on the right edge', () => {
    const node = { ...createNode('gain', 100, 50) }
    const definition = requireNodeDefinition('gain')

    expect(portPosition(node, definition, 'inputs', 'in').x).toBe(100)
    expect(portPosition(node, definition, 'outputs', 'out').x).toBe(100 + NODE_WIDTH)
    expect(portPosition(node, definition, 'inputs', 'cv').y).toBeGreaterThan(
      portPosition(node, definition, 'inputs', 'in').y,
    )
  })
})

describe('param scale', () => {
  const cutoff = requireNodeDefinition('filter').params.find((p) => p.id === 'cutoff')!

  it('round-trips values through the slider mapping', () => {
    for (const value of [20, 440, 2000, 20000]) {
      expect(fromSlider(cutoff, toSlider(cutoff, value))).toBeCloseTo(value, 6)
    }
  })

  it('uses a logarithmic curve for wide ranges', () => {
    expect(toSlider(cutoff, Math.sqrt(20 * 20000))).toBeCloseTo(0.5, 6)
  })
})

describe('param scale curves', () => {
  const spec = { id: 'v', label: 'V', min: 0, max: 10, default: 0 }

  it('a control curve overrides the range rule: log on a narrow positive range, linear on a wide one', () => {
    const narrow = { ...spec, min: 1, max: 4, curve: 'log' as const }
    expect(toSlider(narrow, 2)).toBeCloseTo(0.5, 6)
    const wide = { ...spec, min: 20, max: 20000, curve: 'linear' as const }
    expect(toSlider(wide, 10010)).toBeCloseTo(0.5, 6)
  })

  it('a log curve on a range that includes 0 falls back to straight', () => {
    expect(toSlider({ ...spec, curve: 'log' }, 5)).toBeCloseTo(0.5, 6)
  })

  it('exp starts slow: the middle of the range sits above the middle of the slider, and it round-trips', () => {
    const exp = { ...spec, curve: 'exp' as const }
    expect(fromSlider(exp, 0.5)).toBeLessThan(5)
    for (const value of [0, 1, 4.2, 10]) expect(fromSlider(exp, toSlider(exp, value))).toBeCloseTo(value, 6)
    expect(toSlider(exp, 0)).toBe(0)
    expect(toSlider(exp, 10)).toBeCloseTo(1, 6)
  })

  it('a degenerate range does not divide by zero', () => {
    expect(toSlider({ ...spec, min: 3, max: 3 }, 3)).toBe(0)
  })
})

describe('card height', () => {
  it('is a header and the port rows: settings live in the property editor, not on the card', () => {
    const gain = describeNode(createNode('gain', 0, 0))!
    const rows = Math.max(gain.inputs.length, gain.outputs.length)
    expect(nodeHeight(gain)).toBe(HEADER_HEIGHT + 12 + rows * PORT_ROW_HEIGHT)
    expect(nodeHeight(describeNode(createNode('sampler', 0, 0))!)).toBeLessThan(nodeHeight(gain) + 5 * PORT_ROW_HEIGHT)
  })

  it('grows with the sockets that are drawn, not with the number of parameters', () => {
    const filter = describeNode(createNode('filter', 0, 0))!
    const bare = { ...filter, inputs: filter.inputs.filter((port) => port.param === undefined) }
    expect(nodeHeight(filter)).toBeGreaterThan(nodeHeight(bare))
  })
})

describe('param display', () => {
  const root = requireNodeDefinition('sampler').params.find((p) => p.id === 'root')!

  it('shows MIDI note parameters by name and snaps them to whole notes', () => {
    expect(formatParam(root, 60)).toBe('C4')
    expect(formatParam(root, 69)).toBe('A4')
    expect(snapToStep(root, 60.4)).toBe(60)
    expect(snapToStep(root, 60.6)).toBe(61)
  })
})
