import { describe, expect, it } from 'vitest'
import { type Patch, addNode, createNode } from '@core'
import { NODE_WIDTH } from './geometry'
import { centredOn, freeSpot, popupPosition } from './placement'

const empty: Patch = { nodes: [], connections: [] }

describe('placement', () => {
  it('centres a card on the click, never off the top or left edge', () => {
    expect(centredOn({ x: 400, y: 300 })).toEqual({ x: 400 - NODE_WIDTH / 2, y: 286 })
    expect(centredOn({ x: 10, y: 5 })).toEqual({ x: 0, y: 0 })
  })

  it('keeps the wanted place when it is free', () => {
    const patch = addNode(empty, createNode('gain', 0, 0))
    expect(freeSpot(patch, [], { x: 600, y: 400 })).toEqual({ x: 600, y: 400 })
    expect(freeSpot(empty, [], { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('steps down and to the right until the card is not on another', () => {
    const patch = addNode(empty, createNode('gain', 300, 200))
    const spot = freeSpot(patch, [], { x: 300, y: 200 })
    expect(spot.x).toBeGreaterThan(300)
    expect(spot.y).toBeGreaterThan(200)
    expect(spot.x - 300).toBe(spot.y - 200)
  })

  it('fans out a row of nodes added at the same place', () => {
    let patch = empty
    const spots = []
    for (let i = 0; i < 5; i++) {
      const spot = freeSpot(patch, [], { x: 200, y: 200 })
      spots.push(spot)
      patch = addNode(patch, createNode('gain', spot.x, spot.y))
    }
    expect(new Set(spots.map((spot) => `${spot.x},${spot.y}`)).size).toBe(5)
  })

  it('keeps a popup inside the window', () => {
    const viewport = { width: 1000, height: 800 }
    const size = { width: 340, height: 360 }
    expect(popupPosition({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 })
    expect(popupPosition({ x: 990, y: 790 }, size, viewport)).toEqual({ x: 652, y: 432 })
    expect(popupPosition({ x: -5, y: -5 }, size, viewport)).toEqual({ x: 8, y: 8 })
  })
})
