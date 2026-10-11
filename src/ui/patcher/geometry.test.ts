import { describe, expect, it } from 'vitest'
import { createNode, requireNodeDefinition } from '@core'
import { NODE_WIDTH, portPosition } from './geometry'
import { fromSlider, toSlider } from './param-scale'

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
