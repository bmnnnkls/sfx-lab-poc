import { type SampleInfo, addSamples, createDemoProject } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from './project-store'
import { useSelectionStore } from './selection-store'
import { DEFAULT_SECOND_PANE, paneSampleId, useWavePanesStore, waveViewKey } from './wave-panes'

const sampleOf = (id: string): SampleInfo => ({ id, name: id, extension: 'wav', durationSeconds: 0.1, sampleRate: 8000, channels: 1, bytes: 1000 })

beforeEach(() => {
  useProjectStore.getState().resetProject(addSamples(createDemoProject(), [sampleOf('kick'), sampleOf('pad')]))
  useSelectionStore.getState().selectSample('kick')
  useWavePanesStore.setState({ second: DEFAULT_SECOND_PANE, active: 'main' })
})

describe('the panes', () => {
  it('key a view by pane and origin', () => {
    expect(waveViewKey('main', 'abc')).toBe('main:abc')
    expect(waveViewKey('second', 'abc')).toBe('second:abc')
  })

  it("show the editor's sample in the first pane; the second shows nothing while closed", () => {
    expect(paneSampleId('main')).toBe('kick')
    expect(paneSampleId('second')).toBeNull()
  })

  it("show the first pane's sample in the second until another is picked, and fall back to it when that one is gone", () => {
    useWavePanesStore.getState().setSecond({ open: true })
    expect(paneSampleId('second')).toBe('kick')
    useWavePanesStore.getState().setSecond({ sampleId: 'pad' })
    expect(paneSampleId('second')).toBe('pad')
    useWavePanesStore.getState().setSecond({ sampleId: 'gone' })
    expect(paneSampleId('second')).toBe('kick')
    useSelectionStore.getState().selectSample(null)
    expect(paneSampleId('second')).toBeNull()
  })

  it('make the first pane active when the second closes', () => {
    useWavePanesStore.getState().setSecond({ open: true })
    useWavePanesStore.getState().setActive('second')
    useWavePanesStore.getState().setSecond({ share: 0.3 })
    expect(useWavePanesStore.getState().active).toBe('second')
    useWavePanesStore.getState().setSecond({ open: false })
    expect(useWavePanesStore.getState()).toMatchObject({ active: 'main', second: { open: false, share: 0.3 } })
  })
})
