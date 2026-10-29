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
    expect(view).toMatchObject({ selection: { from: 100, to: 300, channels: 'both' }, cursor: 100, zoomPending: true })
    useWaveEditorStore.getState().setView('origin', { zoomPending: false })
    expect(waveViewOf(useWaveEditorStore.getState().views, 'origin').zoomPending).toBe(false)
  })
})
