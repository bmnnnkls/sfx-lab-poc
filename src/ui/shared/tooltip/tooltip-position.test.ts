import { describe, expect, it } from 'vitest'
import { placeTooltip } from './tooltip-position'

const viewport = { width: 1000, height: 800 }
const size = { width: 200, height: 60 }

describe('placeTooltip', () => {
  it('goes under the target, centred', () => {
    expect(placeTooltip({ x: 400, y: 100, width: 100, height: 20 }, size, viewport)).toEqual({ x: 350, y: 128, side: 'below' })
  })

  it('goes above when there is no room below', () => {
    expect(placeTooltip({ x: 400, y: 760, width: 100, height: 20 }, size, viewport)).toEqual({ x: 350, y: 692, side: 'above' })
  })

  it('stays inside the viewport sideways', () => {
    expect(placeTooltip({ x: 0, y: 100, width: 20, height: 20 }, size, viewport).x).toBe(8)
    expect(placeTooltip({ x: 990, y: 100, width: 20, height: 20 }, size, viewport).x).toBe(792)
  })

  it('a tooltip taller than the room either side sits at the bottom margin instead of off screen', () => {
    const tall = { width: 200, height: 700 }
    const placed = placeTooltip({ x: 400, y: 380, width: 100, height: 20 }, tall, viewport)
    expect(placed.y).toBe(92)
    expect(placed.y + tall.height).toBeLessThanOrEqual(viewport.height - 8)
  })
})
