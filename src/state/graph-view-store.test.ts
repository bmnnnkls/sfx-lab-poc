import { beforeEach, describe, expect, it } from 'vitest'
import { canvasKey, graphKey, livePath, useGraphViewStore } from './graph-view-store'

describe('graph view store', () => {
  beforeEach(() => useGraphViewStore.setState({ viewports: {}, paths: {} }))

  it('keys a graph by its track and kind, and a canvas by the sub-patch open in it', () => {
    expect(graphKey('bass', 'patch')).toBe('bass:patch')
    expect(graphKey('master', 'fx')).toBe('master:fx')
    expect(canvasKey('bass:patch', [])).toBe('bass:patch')
    expect(canvasKey('bass:patch', ['m1', 'm2'])).toBe('bass:patch/m1/m2')
  })

  it("keeps each graph's path and each canvas's view apart", () => {
    const store = useGraphViewStore.getState()
    store.setPath('bass:patch', ['m1'])
    store.setPath('lead:patch', [])
    store.setViewport('bass:patch', { x: 10, y: 20, zoom: 1.5 })
    store.setViewport('bass:patch/m1', { x: 0, y: 0, zoom: 0.5 })
    const { paths, viewports } = useGraphViewStore.getState()
    expect(paths).toEqual({ 'bass:patch': ['m1'], 'lead:patch': [] })
    expect(viewports['bass:patch']).toEqual({ x: 10, y: 20, zoom: 1.5 })
    expect(viewports['bass:patch/m1']?.zoom).toBe(0.5)
    expect(viewports['lead:patch']).toBeUndefined()
  })

  it('cuts a kept path at the first module that is gone', () => {
    const exists = (id: string) => id !== 'gone'
    expect(livePath(['a', 'b'], exists)).toEqual(['a', 'b'])
    expect(livePath(['a', 'gone', 'b'], exists)).toEqual(['a'])
    expect(livePath(['gone'], exists)).toEqual([])
  })
})
