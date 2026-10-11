import { describe, expect, it } from 'vitest'
import { createNode, requireNodeDefinition } from '@core'
import { NODE_WIDTH, SAMPLE_PICKER_HEIGHT, nodeHeight, portPosition } from './geometry'
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

describe('sampler node layout', () => {
  it('reserves room for the sample picker', () => {
    expect(nodeHeight(requireNodeDefinition('sampler'))).toBeGreaterThan(
      nodeHeight(requireNodeDefinition('gain')) + SAMPLE_PICKER_HEIGHT - 1,
    )
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
