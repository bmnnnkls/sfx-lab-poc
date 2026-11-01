import { DEFAULT_ARRANGEMENT_VIEW, HEADER_WIDTH, useArrangementView } from '@state'
import { beforeEach, describe, expect, it } from 'vitest'
import { ARRANGEMENT_VIEW_KEY, OLD_ZOOM_KEY, readArrangementView } from './use-arrangement-view-storage'

const reader = (stored: Record<string, string>) => (key: string) => stored[key] ?? null

describe('the arrangement view settings in storage', () => {
  beforeEach(() => useArrangementView.setState({ ...DEFAULT_ARRANGEMENT_VIEW }))

  it('reads the saved object', () => {
    const saved = { pxPerBeat: 40, grid: 'bar', follow: false, headerWidth: 200 }
    expect(readArrangementView(reader({ [ARRANGEMENT_VIEW_KEY]: JSON.stringify(saved), [OLD_ZOOM_KEY]: '12' }))).toEqual(saved)
  })

  it("takes the prototype's zoom once when nothing new is saved", () => {
    expect(readArrangementView(reader({ [OLD_ZOOM_KEY]: '12' }))).toEqual({ pxPerBeat: 12 })
    expect(readArrangementView(reader({}))).toEqual({})
    expect(readArrangementView(reader({ [ARRANGEMENT_VIEW_KEY]: '{not json' }))).toEqual({})
  })

  it('keeps only valid values when restoring', () => {
    useArrangementView.getState().restore({ pxPerBeat: 'wide', grid: '1/3', follow: 1, headerWidth: 9999 })
    const state = useArrangementView.getState()
    expect(state.pxPerBeat).toBe(DEFAULT_ARRANGEMENT_VIEW.pxPerBeat)
    expect(state.grid).toBe(DEFAULT_ARRANGEMENT_VIEW.grid)
    expect(state.follow).toBe(true)
    expect(state.headerWidth).toBe(HEADER_WIDTH.max)
  })
})
