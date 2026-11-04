import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_WAVE_VIEW, useWaveEditorStore, waveViewOf } from './wave-editor-store'

const view = (id: string) => waveViewOf(useWaveEditorStore.getState().views, id)

beforeEach(() => useWaveEditorStore.setState({ views: {} }))

describe('wave editor store', () => {
  it('opens a sample fitted, at the start, with no selection', () => {
    expect(view('a')).toEqual(DEFAULT_WAVE_VIEW)
    expect(DEFAULT_WAVE_VIEW).toEqual({ framesPerPixel: null, startFrame: 0, cursor: 0, selection: null })
  })

  it('keeps each sample its own view', () => {
    useWaveEditorStore.getState().setView('a', { framesPerPixel: 2, startFrame: 100 })
    useWaveEditorStore.getState().setView('b', { cursor: 7 })
    expect(view('a')).toEqual({ ...DEFAULT_WAVE_VIEW, framesPerPixel: 2, startFrame: 100 })
    expect(view('b')).toEqual({ ...DEFAULT_WAVE_VIEW, cursor: 7 })
  })

  it('orders a selection dragged backwards, and keeps none that is empty', () => {
    useWaveEditorStore.getState().select('a', { from: 90, to: 10, channels: 'left' })
    expect(view('a').selection).toEqual({ from: 10, to: 90, channels: 'left' })
    useWaveEditorStore.getState().select('a', { from: 5, to: 5, channels: 'both' })
    expect(view('a').selection).toBeNull()
  })
})

describe('reveal', () => {
  it('selects a part, puts the cursor at its start and asks the editor to zoom to it once', () => {
    useWaveEditorStore.getState().reveal('origin', { from: 300, to: 100, channels: 'both' })
    const view = waveViewOf(useWaveEditorStore.getState().views, 'origin')
    expect(view).toMatchObject({ selection: { from: 100, to: 300, channels: 'both' }, cursor: 100, zoomTo: { from: 100, to: 300 } })
    expect(useWaveEditorStore.getState().takeZoom('origin')).toEqual({ from: 100, to: 300 })
    expect(waveViewOf(useWaveEditorStore.getState().views, 'origin').zoomTo).toBeUndefined()
  })
})

describe('zoom', () => {
  it('asks for a zoom once: the editor takes it, and taking it again finds nothing', () => {
    useWaveEditorStore.getState().zoom('a', 'fit')
    expect(view('a').zoomTo).toBe('fit')
    expect(useWaveEditorStore.getState().takeZoom('a')).toBe('fit')
    expect(useWaveEditorStore.getState().takeZoom('a')).toBeUndefined()
    useWaveEditorStore.getState().zoom('a', { from: 10, to: 20 })
    useWaveEditorStore.getState().zoom('a', { from: 30, to: 40 })
    expect(useWaveEditorStore.getState().takeZoom('a')).toEqual({ from: 30, to: 40 })
    expect(useWaveEditorStore.getState().takeZoom('b')).toBeUndefined()
  })
})

describe('ask', () => {
  it("opens and closes an edit's settings popover in the sample's view", () => {
    useWaveEditorStore.getState().ask('a', 'gain')
    expect(view('a').asking).toBe('gain')
    expect(view('b').asking).toBeUndefined()
    useWaveEditorStore.getState().ask('a', null)
    expect(view('a').asking).toBeNull()
  })
})
