import { describe, expect, it } from 'vitest'
import { canvasPoint, zoomAt } from './viewport'

describe('graph viewport coordinates', () => {
  it('keeps the cursor over the same graph point when zooming a panned view', () => {
    const view = { x: -320, y: 70, zoom: 0.5 }
    const anchor = { x: 240, y: 180 }
    expect(canvasPoint(anchor, zoomAt(view, 1.5, anchor))).toEqual(canvasPoint(anchor, view))
  })

  it('limits zoom while still anchoring at the cursor', () => {
    const view = { x: 20, y: -80, zoom: 1 }
    const anchor = { x: 120, y: 120 }
    for (const [requested, expected] of [[0.01, 0.25], [100, 2]]) {
      const next = zoomAt(view, requested!, anchor)
      expect(next.zoom).toBe(expected)
      expect(canvasPoint(anchor, next)).toEqual(canvasPoint(anchor, view))
    }
  })
})
